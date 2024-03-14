const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploy, bigNum, smallNum } = require("hardhat-libutils");

const {
    uniswapV2_router,
} = require("../external_abi/UniswapV2Router.abi.json");
const { getDeploymentParam } = require("../scripts/params");

describe("PriceOracle test", function () {
    let params;
    before(async function () {
        [this.deployer, this.account_1] = await ethers.getSigners();

        params = getDeploymentParam();

        this.PriceOracle = await deploy(
            "PriceOracle",
            "PriceOracle",
            params.USDCAddress,
            params.dexRouterV2Address
        );

        this.dexRouter = new ethers.Contract(
            params.dexRouterV2Address,
            uniswapV2_router,
            this.deployer
        );
    });

    it("check deployment", async function () {
        console.log("deployed successfully!");
    });

    it("check price for WBTC, WETH", async function () {
        let tokens = [params.WBTCAddress, params.WETHAddress];
        let decimals = [8, 18];

        for (let i = 0; i < tokens.length; i++) {
            let amounts = await this.dexRouter.getAmountsOut(
                bigNum(1, decimals[i]),
                [tokens[i], params.USDCAddress]
            );

            let price = await this.PriceOracle.getTokenPrice(tokens[i]);

            expect(smallNum(amounts[1], 6)).to.be.closeTo(
                smallNum(price, 18),
                0.001
            );
        }
    });

    it("updateBaseToken", async function () {
        expect(await this.PriceOracle.baseToken()).to.be.equal(
            params.USDCAddress
        );

        // reverts if caller is not the owner
        await expect(
            this.PriceOracle.connect(this.account_1).updateBaseToken(
                params.WBTCAddress
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");

        // reverts if base token address is invalid
        await expect(
            this.PriceOracle.updateBaseToken(ethers.constants.AddressZero)
        ).to.be.revertedWith("invalid baseToken address");

        // update baseToken and check
        await this.PriceOracle.updateBaseToken(params.WBTCAddress);
        expect(await this.PriceOracle.baseToken()).to.be.equal(
            params.WBTCAddress
        );
    });
});
