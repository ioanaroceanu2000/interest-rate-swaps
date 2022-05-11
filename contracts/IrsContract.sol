// all this assumes that always value of marginLoser >= value diff
// SPDX-License-Identifier: MIT

pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@prb/math/contracts/PRBMathSD59x18.sol";
import "./AaveProtocolDataProvider.sol";
//import "@aave/protocol-v2/contracts/misc/AaveProtocolDataProvider.sol";

contract IrsContract is ReentrancyGuard{

  address public AAVE_CONTRACT;
  // = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";

  Party public ft;
  Party public vt;

  struct Party{
    address wallet;
    bool signed;
    uint marginAmount;
  }

  uint public notionalAmount;
  address public asset;
  uint public duration;
  uint public initTime;
  uint public initIndex;
  uint public fixedRatePerSecond;

  // @description Registers an IRS contract
  // @note all values must be provided with 18 decimals (apart from duration)
  // @params asset: underlying asset
  // notional: notional amount
  // duration: term of contract in seconds, count-down since both signatures are gathered
  // initTime: timestamp that determines deadline for signature gathering
  // ft: fixed rate taker
  // vt: variable rate taker
  // fixedYearRate: the constant fixed interest rate per year
  constructor(address _asset,
    uint _notional,
    uint128 _duration,
    uint _initTime,
    address _ft,
    address _vt,
    uint128 _fixedYearRate,
    address _AAVE_CONTRACT) public
  {
    require(block.timestamp < _initTime, "please choose a time in the future");
    AAVE_CONTRACT = _AAVE_CONTRACT;

    asset = _asset;
    notionalAmount = _notional;
    duration = _duration;
    initTime = _initTime;
    fixedRatePerSecond = SafeMath.div(_fixedYearRate, 31536000) + 1e18;

    ft = Party(_ft, false, 0);
    vt = Party(_vt, false, 0);
  }


  // @description Called by parties to sign the contract and deposit their margin
  function signAndDepositMargin() public {
    require(block.timestamp <= initTime, "Missed deadline");
    initTime = block.timestamp;

    // deposit margin
    uint marginAmount = notionalAmount/10;
    ERC20(asset).transferFrom(msg.sender, address(this), marginAmount);

    // register signature
    if(msg.sender == ft.wallet){
      ft = Party(ft.wallet, true, marginAmount);
    }
    if(msg.sender == vt.wallet){
      vt = Party(vt.wallet, true, marginAmount);
    }

    // record initial yield index when both signatures are gathered
    if(ft.signed && vt.signed){
      (,,,,,,,initIndex,,) = AaveProtocolDataProvider(AAVE_CONTRACT).getReserveData(asset);
    }

  }


  // @description Settles contract, only available at maturity
  function settleContract() public nonReentrant {
    require(ft.signed && vt.signed, "Contract not yet signed");
    require(initTime + duration >= block.timestamp, "Contract not at maturity yet");
    //require(ERC20(asset).balanceOf(address(this)) == vt.marginAmount + ft.marginAmount, "Out of funds");
    //require(vt.marginAmount == ft.marginAmount);

    (uint diff, Party memory winner, Party memory loser) = getDiff();
    require(diff <= ft.marginAmount, "This should have been liquidated by now");

    ERC20(asset).transfer(winner.wallet, diff + winner.marginAmount);
    ERC20(asset).transfer(loser.wallet, loser.marginAmount - diff);
  }

  // @description Liquidates the contract in case margin falls under 7%
  // Liquidator receives up to 20% of margin
  // @params toLiquidate: address of party at risk
  function liquidate(address toLiquidate) external nonReentrant{
    require(ft.signed && vt.signed, "Contract not yet signed");

    (uint diff, Party memory winner, Party memory loser) = getDiff();
    require(winner.wallet == toLiquidate, "Position is in-the-money");

    require(!isSafe(loser, diff), "Position is still safe");
    require(diff <= loser.marginAmount, "This should have been liquidated by now");

    ERC20(asset).transfer(winner.wallet, diff + winner.marginAmount);

    uint forLiquidator = SafeMath.div(SafeMath.mul(loser.marginAmount, 2), 10);
    // case 1: after paying the winner, liquidator can be given 20% of margin
    // case 1: else, pay liquidator only what's left of the loser's margin
    if(loser.marginAmount > SafeMath.add(forLiquidator, diff)){
      ERC20(asset).transfer(msg.sender, forLiquidator);
      loser.marginAmount = SafeMath.sub(SafeMath.sub(loser.marginAmount, forLiquidator), diff);
      ERC20(asset).transfer(loser.wallet, loser.marginAmount);
    } else {
      ERC20(asset).transfer(msg.sender, SafeMath.sub(loser.marginAmount, diff));
    }
  }

  // @description Get the cashflow difference of the two rates
  // @returns current value difference, party in-the-money, party out-of-money
  function getDiff() view private returns (uint, Party memory, Party memory){
    (,,,,,,,uint currentIndex,,)= AaveProtocolDataProvider(AAVE_CONTRACT).getReserveData(asset); // * 10^27
    require(currentIndex > initIndex);

    uint valueFixed = SafeMath.div(SafeMath.mul(currentIndex, notionalAmount), initIndex); // 18 dec
    uint valueVariable = SafeMath.div(
      SafeMath.mul(
        uint(PRBMathSD59x18.pow(int(fixedRatePerSecond), int(duration))),
        notionalAmount),
      1e18); // 18 dec

    if(valueFixed > valueVariable){
      return (valueFixed - valueVariable, vt, ft);
    }
    return (valueVariable - valueFixed, ft, vt);
  }


  // @description Return true if position is not at risk of liquidation
  // Returns false if position should be liquidated
  // @params party: party whose position is considered for liquidation
  // diff: current cashflow difference
  function isSafe(Party memory party, uint diff) view private returns (bool) {
    uint accuredValue =  SafeMath.add(notionalAmount, diff);
    uint liquidationLimit = SafeMath.div(SafeMath.mul(accuredValue, 7), 100);

    return party.marginAmount > liquidationLimit;
  }

}
