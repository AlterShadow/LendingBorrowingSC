const { ethers } = require("hardhat");
const { erc20_abi } = require("../external_abi/ERC20.abi.json");
const {
  uniswapV2_router,
} = require("../external_abi/UniswapV2Router.abi.json");
const { getDeploymentParam } = require("./params");
const { deploy, deployProxy, getContract } = require("hardhat-libutils");

async function main() {
  let [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account: ", deployer.address);
  let param = getDeploymentParam();
  let feeRate = {
    borrowingFeeRate: 100, // 1%
    redeemingFeeRate: 200, // 2%
    claimingFeeRate: 150, // 1.5%
  };

  let interestRateModel = await deploy(
    "InterestRateModel",
    "InterestRateModel",
    BigInt(param.interestRate.blocksPerYear),
    BigInt(param.interestRate.baseRatePerYear),
    BigInt(param.interestRate.multiplerPerYear),
    BigInt(param.interestRate.jumpMultiplierPerYear),
    BigInt(param.interestRate.kink),
    deployer.address,
    param.interestRate.name
  );

  let priceOracle = await deploy(
    "PriceOracle",
    "PriceOracle",
    param.WHBARAddress,
    param.dexRouterV2Address
  );

  let marketPositionManager = await deployProxy(
    "MarketPositionManager",
    "MarketPositionManager",
    [priceOracle.address, param.maxLiquidateRate]
  );

  await deployProxy("SFProtocolToken", "SFProtocolToken", [
    feeRate,
    param.USDCAddress,
    interestRateModel.address,
    marketPositionManager.address,
    param.initialExchangeRateMantissa,
    "Sirio USD Coin",
    "sfUSD",
  ]);

  console.log("Deployed successfully!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
