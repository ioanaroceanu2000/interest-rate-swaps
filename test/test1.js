const Web3 = require("web3");
const solc = require("solc");
const fs = require("fs")
const BigNumber = require('bignumber.js');
const Tx = require('ethereumjs-tx').Transaction;

const IrsContract = artifacts.require("IrsContract");
const AaveProtocolDataProvider = artifacts.require("AaveProtocolDataProvider");
//const ERC20 = artifacts.require("@openzeppelin/contracts/token/ERC20/ERC20.sol");
const web3  = new Web3("http://localhost:7545");

contract('IrsContract', () => {
  var _notional = 10;
  var _duration = 30;
  var _ft = web3.utils.toChecksumAddress('0x80d1b4141D7EF8585257E7b28711473EFBB6BDc9');
  var _vt = web3.utils.toChecksumAddress('0x220A865054bFa93184ed7Ee60796A8c75623441E');
  var _fixedYearRate = 3000;
  var _initTime = null;
  var _AAVE_CONTRACT = web3.utils.toChecksumAddress('0x3c73A5E5785cAC854D468F727c606C07488a29D6'); //check
  var _asset = web3.utils.toChecksumAddress('0x7079f3762805CFf9C979a5bDC6f5648bCFEE76C8');
  var usdcInstance = null;
  var aaveInstance = null;
  const privateKeyAcc1 = '';
  const privateKeyAcc0 = '';
  var accounts = null;
  before(async () => {
    let block = await web3.eth.getBlock("latest");
    console.log(block);
    var _initTime = block.timestamp;
    _initTime += 300;

    accounts = await web3.eth.getAccounts();
    _ft = accounts[0];
    _vt = accounts[1];
    //usdcInstance = await ERC20.at(_asset);
    //aaveInstance = await AaveProtocolDataProvider.at(_AAVE_CONTRACT);
    const contractInstance = await IrsContract.new(_asset,_notional,_duration,_initTime,_ft,_vt,_fixedYearRate,_AAVE_CONTRACT);

  });

  it('should create the IRS contract', async () => {
    assert.equal(contractInstance.fixedRatePerSecond, _fixedYearRate, "Wrong fiex rate");
    assert.equal(contractInstance.ft.signed, false, "Signed not false");
    assert.equal(contractInstance.vt.signed, false, "Signed not false");
    assert.equal(contractInstance.ft.wallet, _ft, "Wrong address");
    assert.equal(contractInstance.vt.wallet, _vt, "Wrong address");
  });
  it('should not create the IRS contract', async () => {
    var _initTime2 = _initTime.add(1000);
    var error = false;
    try{
      const contractInstance2 = await IrsContract.new(_asset,
          _notional,
          _duration,
          _initTime2,
          _ft,
          _vt,
          _fixedYearRate,
          _AAVE_CONTRACT
      );
    }catch(err){
      console.log(err);
      error = true;
    }
    assert.equal(error, true, "It didn't throw an error");
  });

  it('should sign and deposit', async () => {
    givePermissionToContract(accounts[0], privateKeyAcc0, contractInstance.address, _notional/10, usdcInstance,_USDC_ADDRESS);
    await contractInstance.signAndDepositMargin();

    assert.equal(contractInstance.ft.signed, true, "It didn't sign");

    var balance;
    await usdcInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });
    assert.equal(balance, _notional/10, "It didn't deposit margin");
  });

  it('should sign and deposit again', async () => {
    givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, _notional/10, usdcInstance,_USDC_ADDRESS);
    await signFromAccount(accounts[1], privateKeyAcc1, contractInstance.address, contractInstance);

    assert.equal(contractInstance.vt.signed, true, "It didn't sign");

    var balance;
    await usdcInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });
    assert.equal(balance, _notional/5, "It didn't deposit margin");
    assert.notEqual(contractInstance.initIndex, 0, "It didn't retrieve liquidity index");
  });

  it('should settle contract', async () => {
  });

});

// give permission to contract to retreive tokens
async function signFromAccount(account, privateKey, contractAddress, contractInstance){
  var nonce = await web3.eth.getTransactionCount(account);
  const rawTx = {
    nonce: nonce,
    from: account,
    to: contractAddress,
    gasLimit: web3.utils.toHex(200000),
    data: tokenInstance.methods.signAndDepositMargin().encodeABI()
  };
  // private key of the second account
  var privateKey = new Buffer(privateKey, 'hex');
  var tx = new Tx(rawTx);
  tx.sign(privateKey);
  var serializedTx = tx.serialize();
  web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', console.log);
}


// give permission to contract to retreive tokens
async function givePermissionToContract(account, privateKey, contractAddress, amount, tokenInstance, tokenAddress){
  var nonce = await web3.eth.getTransactionCount(account);
  const rawTx = {
    nonce: nonce,
    from: account,
    to: tokenAddress,
    gasLimit: web3.utils.toHex(200000),
    data: tokenInstance.methods.approve(contractAddress, amount).encodeABI()
  };
  // private key of the second account
  var privateKey = new Buffer(privateKey, 'hex');
  var tx = new Tx(rawTx);
  tx.sign(privateKey);
  var serializedTx = tx.serialize();
  web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', console.log);
}
