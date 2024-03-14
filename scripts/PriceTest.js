const { ethers } = require("hardhat");
const { erc20_abi } = require("../external_abi/ERC20.abi.json");
const {
    uniswapV2_router,
} = require("../external_abi/UniswapV2Router.abi.json");
const { getDeploymentParam } = require("./params");
const { bigNum, smallNum } = require("hardhat-libutils");

async function fetchPrice(dexRouter, token0Addr, token1Addr) {
    let [deployer] = await ethers.getSigners();
    let token0 = new ethers.Contract(token0Addr, erc20_abi, deployer);
    let token1 = new ethers.Contract(token1Addr, erc20_abi, deployer);
    let token0Decimal = await token0.decimals();
    let token1Decimal = await token1.decimals();

    let amounts = await dexRouter.getAmountsOut(bigNum(1, token0Decimal), [
        token0Addr,
        token1Addr,
    ]);
    console.log(smallNum(amounts[1], token1Decimal));
}

async function main() {
    let [deployer] = await ethers.getSigners();
    let param = getDeploymentParam();
    let dexRouter = new ethers.Contract(
        param.dexRouterV2Address,
        uniswapV2_router,
        deployer
    );

    console.log("WBTC price");
    await fetchPrice(dexRouter, param.WBTCAddress, param.WHBARAddress);

    console.log("WETH price");
    await fetchPrice(dexRouter, param.WETHAddress, param.WHBARAddress);

    console.log("HBARX price");
    await fetchPrice(dexRouter, param.HBARXAddress, param.WHBARAddress);

    console.log("USDC price");
    await fetchPrice(dexRouter, param.USDCAddress, param.WHBARAddress);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
