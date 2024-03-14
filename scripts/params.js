const { ethers } = require("hardhat");

const DEPLOYMENT_PARAM = {
  hedera_mainnet: {
    dexRouterV2Address: "0x00000000000000000000000000000000002e7a5d", // SaucerSwap
    WBTCAddress: "0x0000000000000000000000000000000000101afb",
    WETHAddress: "0x000000000000000000000000000000000008437c",
    WHBARAddress: "0x0000000000000000000000000000000000163b5a",
    HBARXAddress: "0x00000000000000000000000000000000000cba44",
    USDCAddress: "0x000000000000000000000000000000000006f89a",
    maxLiquidateRate: 10000, // 100%
    initialExchangeRateMantissa: ethers.utils.parseUnits("0.02"),
    interestRate: {
      blocksPerYear: 365 * 24 * 60 * 60,
      baseRatePerYear: ethers.utils.parseEther("0.02"),
      multiplerPerYear: ethers.utils.parseEther("0.225"),
      jumpMultiplierPerYear: ethers.utils.parseEther("1.25"),
      kink: ethers.utils.parseEther("0.8"),
      name: "MediumRateModel",
    },
  },
  hedera_testnet: {
    dexRouterV2Address: "0x000000000000000000000000000000000000e8df", // SaucerSwap
    WBTCAddress: "0x000000000000000000000000000000000068017d",
    WETHAddress: "0x00000000000000000000000000000000006801b3",
    WHBARAddress: "0x000000000000000000000000000000000000e6a2",
    USDCAddress: "0x00000000000000000000000000000000006801ba",
    maxLiquidateRate: 10000, // 100%
    initialExchangeRateMantissa: ethers.utils.parseUnits("0.02"),
    interestRate: {
      blocksPerYear: 365 * 24 * 60 * 60,
      baseRatePerYear: ethers.utils.parseEther("0.02"),
      multiplerPerYear: ethers.utils.parseEther("0.225"),
      jumpMultiplierPerYear: ethers.utils.parseEther("1.25"),
      kink: ethers.utils.parseEther("0.8"),
      name: "MediumRateModel",
    },
  },
  hardhat: {
    dexRouterV2Address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    WBTCAddress: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    WETHAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDCAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    maxLiquidateRate: 10000, // 100%
    initialExchangeRateMantissa: ethers.utils.parseUnits("0.02"),
    interestRate: {
      blocksPerYear: 365 * 24 * 60 * 60,
      baseRatePerYear: ethers.utils.parseEther("0.02"),
      multiplerPerYear: ethers.utils.parseEther("0.225"),
      jumpMultiplierPerYear: ethers.utils.parseEther("1.25"),
      kink: ethers.utils.parseEther("0.8"),
      name: "MediumRateModel",
    },
  },
};

const getDeploymentParam = () => {
  if (network.name == "hedera_mainnet") {
    return DEPLOYMENT_PARAM.hedera_mainnet;
  } else if (network.name == "hardhat") {
    return DEPLOYMENT_PARAM.hardhat;
  } else if (network.name == "hedera_testnet") {
    return DEPLOYMENT_PARAM.hedera_testnet;
  } else {
    return DEPLOYMENT_PARAM.hardhat;
  }
};

module.exports = {
  getDeploymentParam,
};
