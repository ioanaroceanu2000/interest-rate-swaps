const Web3 = require("web3");
const solc = require("solc");
const fs = require("fs")
const BigNumber = require('bignumber.js');
const Tx = require('ethereumjs-tx').Transaction;

const IrsContract = artifacts.require("IrsContract");
const Token = artifacts.require("Token");
const AaveProtocolDataProvider = artifacts.require("AaveProtocolDataProvider");
const web3  = new Web3("http://localhost:7545");

contract('IrsContract', () => {
  var _notional = 10;
  var _duration = 30;
  var _ft = web3.utils.toChecksumAddress('0x80d1b4141D7EF8585257E7b28711473EFBB6BDc9');
  var _vt = web3.utils.toChecksumAddress('0x220A865054bFa93184ed7Ee60796A8c75623441E');
  var _fixedYearRate = new BigNumber(1e18);
  var _initTime = null;
  var _AAVE_CONTRACT = web3.utils.toChecksumAddress('0x3c73A5E5785cAC854D468F727c606C07488a29D6');
  var _asset = web3.utils.toChecksumAddress('0x7079f3762805CFf9C979a5bDC6f5648bCFEE76C8');

  var usdcInstance = null;
  var aaveInstance = null;
  const privateKeyAcc1 = '7a879a59323a171826fdbbab1573ab1f20274dc2cc57c11ca47f1c2485c96a24';
  const privateKeyAcc0 = '475e5225a9f4a32a96d78fb82bf5493cd25caa5ca133456ee8a401b0876242d1';
  var accounts = null;
  var contractInstance = null;
  before(async () => {
    let block = await web3.eth.getBlock("latest");
    _initTime = block.timestamp + 300;

    accounts = await web3.eth.getAccounts();
    _ft = accounts[0];
    _vt = accounts[1];
    usdcInstance = await Token.new("USDC", "USDC");
    _asset = usdcInstance.address;
    //aaveInstance = await AaveProtocolDataProvider.at(_AAVE_CONTRACT);
    contractInstance = await IrsContract.new(_asset,_notional,_duration,_initTime,_ft,_vt,_fixedYearRate,_AAVE_CONTRACT);
  });

  it('should create the IRS contract', async () => {
    var fixedRate = await contractInstance.fixedRatePerSecond();
    var expectedRate = new BigNumber(1e18);
    expectedRate = expectedRate.plus(31709791983);
    assert.equal(fixedRate.toString(), expectedRate.toString(), "Wrong fiex rate");

    var ft = await contractInstance.ft();
    var vt = await contractInstance.vt();
    assert.equal(ft['signed'], false, "Signed not false");
    assert.equal(vt['signed'], false, "Signed not false");
    assert.equal(ft['wallet'], _ft, "Wrong address");
    assert.equal(vt['wallet'], _vt, "Wrong address");
  });

  it('should not create the IRS contract', async () => {
    var _initTime2 = _initTime - 100000;
    var error = false;
    try{
      var contractInstance2 = await IrsContract.new(_asset,
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
    givePermissionToContract(accounts[0], privateKeyAcc0, contractInstance.address, _notional/10, usdcInstance, _asset);
    var balance;
    await usdcInstance.balanceOf(accounts[0]).then(res =>{
      balance = res;
    });
    console.log(balance);
    await contractInstance.signAndDepositMargin();

    var ft = await contractInstance.ft();
    assert.equal(ft['signed'], true, "It didn't sign");

    var balance;
    await usdcInstance.balanceOf(contractInstance.address).then(res =>{ balance = res; });
    assert.equal(balance, _notional/10, "It didn't deposit margin");
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
    data: tokenInstance.contract.methods.approve(contractAddress, amount).encodeABI()
  };
  // private key of the second account
  var privateKey = new Buffer(privateKey, 'hex');
  var tx = new Tx(rawTx);
  tx.sign(privateKey);
  var serializedTx = tx.serialize();
  web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', console.log);
}
