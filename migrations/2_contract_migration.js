const IrsContract = artifacts.require('IrsContract');
const Web3 = require("web3");
const web3  = new Web3("http://localhost:7545");
const BigNumber = require('bignumber.js');

module.exports = function (deployer) {
  web3.eth.getBlock("latest").then(async (res) => {
    let block = res;
    console.log(block);
    var _initTime = block.timestamp;
    _initTime += 300;
    // (address asset, uint notional, uint128 duration, uint initTime, address ft, address vt, uint128 fixedYearRate)
    deployer.deploy(IrsContract,
      web3.utils.toChecksumAddress('0x3c73A5E5785cAC854D468F727c606C07488a29D6'),
      new BigNumber(1000000000000000000),
      30,
      _initTime,
      web3.utils.toChecksumAddress('0x80d1b4141D7EF8585257E7b28711473EFBB6BDc9'),
      web3.utils.toChecksumAddress('0x80d1b4141D7EF8585257E7b28711473EFBB6BDc9'),
      new BigNumber(1e18),
      web3.utils.toChecksumAddress('0x3c73A5E5785cAC854D468F727c606C07488a29D6')
    );
  });


};
