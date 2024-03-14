const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  deploy,
  bigNum,
  deployProxy,
  getCurrentTimestamp,
  smallNum,
  increaseBlock,
  year,
} = require("hardhat-libutils");

const { getDeploymentParam } = require("../scripts/params");

const { erc20_abi } = require("../external_abi/ERC20.abi.json");
const { WETH_abi } = require("../external_abi/WETH.abi.json");
const {
  uniswapV2_router,
} = require("../external_abi/UniswapV2Router.abi.json");

describe("Sirio Finance Protocol test", function () {
  let feeRate, param, underlyingTokenAddress, name, symbol;
  let DAIAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  before(async function () {
    [this.deployer, this.account_1, this.account_2, this.account_3] =
      await ethers.getSigners();

    param = getDeploymentParam();
    underlyingTokenAddress = param.USDCAddress;
    name = "Sirio USD Coin";
    symbol = "sfUSD";
    feeRate = {
      borrowingFeeRate: 100, // 1%
      redeemingFeeRate: 200, // 2%
      claimingFeeRate: 150, // 1.5%
    };

    this.USDC = new ethers.Contract(
      param.USDCAddress,
      erc20_abi,
      this.deployer
    );

    this.WETH = new ethers.Contract(param.WETHAddress, WETH_abi, this.deployer);

    this.dexRouter = new ethers.Contract(
      param.dexRouterV2Address,
      uniswapV2_router,
      this.deployer
    );

    this.interestRateModel = await deploy(
      "InterestRateModel",
      "InterestRateModel",
      BigInt(param.interestRate.blocksPerYear),
      BigInt(param.interestRate.baseRatePerYear),
      BigInt(param.interestRate.multiplerPerYear),
      BigInt(param.interestRate.jumpMultiplierPerYear),
      BigInt(param.interestRate.kink),
      this.deployer.address,
      param.interestRate.name
    );

    this.priceOracle = await deploy(
      "PriceOracle",
      "PriceOracle",
      DAIAddress,
      param.dexRouterV2Address
    );

    this.marketPositionManager = await deployProxy(
      "MarketPositionManager",
      "MarketPositionManager",
      [this.priceOracle.address, param.maxLiquidateRate]
    );

    this.sfUSDC = await deployProxy("SFProtocolToken", "SFProtocolToken", [
      feeRate,
      underlyingTokenAddress,
      this.interestRateModel.address,
      this.marketPositionManager.address,
      param.initialExchangeRateMantissa,
      name,
      symbol,
    ]);

    this.sfWETH = await deployProxy("SFProtocolToken", "SFProtocolToken", [
      feeRate,
      param.WETHAddress,
      this.interestRateModel.address,
      this.marketPositionManager.address,
      param.initialExchangeRateMantissa,
      "Sirio Wrapped ETH",
      "sfWETH",
    ]);
  });

  it("check deployment", async function () {
    console.log("deployed successfully!");
  });

  describe("pause and check functions", function () {
    describe("pause", function () {
      it("reverts if caller is not the owner", async function () {
        await expect(
          this.sfUSDC.connect(this.account_1).pause()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("pause", async function () {
        await this.sfUSDC.pause();
      });

      it("reverts if already paused", async function () {
        await expect(this.sfUSDC.pause()).to.be.revertedWith(
          "Pausable: paused"
        );
      });
    });

    describe("check functions that it reverts", function () {
      it("supplyUnderlying", async function () {
        await expect(this.sfUSDC.supplyUnderlying(100)).to.be.revertedWith(
          "Pausable: paused"
        );
      });

      it("redeem", async function () {
        await expect(this.sfUSDC.redeem(100)).to.be.revertedWith(
          "Pausable: paused"
        );

        await expect(
          this.sfUSDC.redeemExactUnderlying(1000)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("borrow", async function () {
        await expect(this.sfUSDC.borrow(1000)).to.be.revertedWith(
          "Pausable: paused"
        );
      });
    });
  });

  describe("unpause", function () {
    it("reverts if caller is not the owner", async function () {
      await expect(
        this.sfUSDC.connect(this.account_1).unpause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("unpause", async function () {
      await this.sfUSDC.unpause();
    });

    it("reverts if already unpaused", async function () {
      await expect(this.sfUSDC.unpause()).to.be.revertedWith(
        "Pausable: not paused"
      );
    });
  });

  describe("supply underlying tokens", function () {
    let supplyAmount;
    it("buy some USDC for supply", async function () {
      await this.dexRouter
        .connect(this.account_1)
        .swapExactETHForTokens(
          0,
          [param.WETHAddress, this.USDC.address],
          this.account_1.address,
          BigInt(await getCurrentTimestamp()) + BigInt(100),
          { value: bigNum(5, 18) }
        );

      supplyAmount = await this.USDC.balanceOf(this.account_1.address);
      console.log("swappedAmount: ", smallNum(supplyAmount, 6));
      supplyAmount = BigInt(supplyAmount) / BigInt(4);

      await this.USDC.connect(this.account_1).approve(
        this.sfUSDC.address,
        BigInt(supplyAmount)
      );

      expect(
        await this.sfUSDC.getSuppliedAmount(this.account_1.address)
      ).to.be.equal(0);
    });

    it("reverts if supply amount is invalid", async function () {
      await expect(
        this.sfUSDC.connect(this.account_1).supplyUnderlying(0)
      ).to.be.revertedWith("invalid supply amount");
    });

    it("reverts if token is not listed", async function () {
      await expect(
        this.sfUSDC
          .connect(this.account_1)
          .supplyUnderlying(BigInt(supplyAmount))
      ).to.be.revertedWith("not listed token");
    });

    it("add USDC and WETH to markets", async function () {
      // reverts if caller is not the owner
      await expect(
        this.marketPositionManager
          .connect(this.account_1)
          .addToMarket(this.sfUSDC.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // add sfUSDC to markets
      await this.marketPositionManager.addToMarket(this.sfUSDC.address);
      await this.marketPositionManager.addToMarket(this.sfWETH.address);

      // reverts if token is already added
      await expect(
        this.marketPositionManager.addToMarket(this.sfUSDC.address)
      ).to.be.revertedWith("already added");
    });

    it("supply and check", async function () {
      let beforeBal = await this.sfUSDC.balanceOf(this.account_1.address);
      await this.sfUSDC
        .connect(this.account_1)
        .supplyUnderlying(BigInt(supplyAmount));
      let afterBal = await this.sfUSDC.balanceOf(this.account_1.address);
      let receivedShareAmounts = smallNum(
        BigInt(afterBal) - BigInt(beforeBal),
        18
      );
      let originSupplyAmount = smallNum(supplyAmount, 6);
      console.log("received shares: ", receivedShareAmounts);

      // this supply is the first time and initialExchageRate is 0.02,
      // so shareAmount should be supplyAmount * 50
      expect(receivedShareAmounts / originSupplyAmount).to.be.closeTo(
        50,
        0.00001
      );
    });

    it("supply again and check", async function () {
      let originShare = await this.sfUSDC.balanceOf(this.account_1.address);
      await this.USDC.connect(this.account_1).approve(
        this.sfUSDC.address,
        BigInt(supplyAmount)
      );
      let beforeBal = await this.sfUSDC.balanceOf(this.account_1.address);
      await this.sfUSDC
        .connect(this.account_1)
        .supplyUnderlying(BigInt(supplyAmount));
      let afterBal = await this.sfUSDC.balanceOf(this.account_1.address);
      let receivedShareAmounts = BigInt(afterBal) - BigInt(beforeBal);
      expect(smallNum(originShare, 18)).to.be.equal(
        smallNum(receivedShareAmounts, 18)
      );
    });
  });

  describe("redeem & redeemExactUnderlying", function () {
    describe("redeem", function () {
      it("reverts if share amount is invalid", async function () {
        await expect(
          this.sfUSDC.connect(this.account_1).redeem(0)
        ).to.be.revertedWith("invalid amount");
      });

      it("redeem and check", async function () {
        let suppliedAmount = await this.sfUSDC.getSuppliedAmount(
          this.account_1.address
        );
        let ownedShareAmount = await this.sfUSDC.balanceOf(
          this.account_1.address
        );

        let redeemShare = BigInt(ownedShareAmount) / BigInt(2);
        let expectUnderlyingAmount = BigInt(suppliedAmount) / BigInt(2);
        let redeemFee = feeRate.redeemingFeeRate;
        let feeAmount =
          (BigInt(expectUnderlyingAmount) * BigInt(redeemFee)) / BigInt(10000);
        expectUnderlyingAmount =
          BigInt(expectUnderlyingAmount) - BigInt(feeAmount);

        let beforeOwnerBal = await this.USDC.balanceOf(this.deployer.address);
        let beforeRecvBal = await this.USDC.balanceOf(this.account_1.address);
        await this.sfUSDC.connect(this.account_1).redeem(BigInt(redeemShare));
        let afterOwnerBal = await this.USDC.balanceOf(this.deployer.address);
        let afterRecvBal = await this.USDC.balanceOf(this.account_1.address);

        let ownerReceivedAmount =
          BigInt(afterOwnerBal) - BigInt(beforeOwnerBal);
        let redeemerReceivedAmount =
          BigInt(afterRecvBal) - BigInt(beforeRecvBal);

        expect(smallNum(ownerReceivedAmount, 6)).to.be.closeTo(
          smallNum(feeAmount, 6),
          0.0001
        );
        expect(smallNum(redeemerReceivedAmount, 6)).to.be.closeTo(
          smallNum(expectUnderlyingAmount, 6),
          0.0001
        );
      });
    });

    describe("redeemExactUnderlying", function () {
      it("reverts if amount is invalid", async function () {
        await expect(
          this.sfUSDC.connect(this.account_1).redeemExactUnderlying(0)
        ).to.be.revertedWith("invalid amount");
      });

      it("redeem and check", async function () {
        let suppliedAmount = await this.sfUSDC.getSuppliedAmount(
          this.account_1.address
        );
        let redeemAmount = BigInt(suppliedAmount) / BigInt(2);
        let ownedShareAmount = await this.sfUSDC.balanceOf(
          this.account_1.address
        );
        let feeAmount =
          (BigInt(redeemAmount) * BigInt(feeRate.redeemingFeeRate)) /
          BigInt(10000);
        let expectRedeemAmount = BigInt(redeemAmount) - BigInt(feeAmount);

        let beforeUnderlyingBal = await this.USDC.balanceOf(
          this.account_1.address
        );
        let beforeShareBal = await this.sfUSDC.balanceOf(
          this.account_1.address
        );
        await this.sfUSDC
          .connect(this.account_1)
          .redeemExactUnderlying(BigInt(redeemAmount));
        let afterUnderlyingBal = await this.USDC.balanceOf(
          this.account_1.address
        );
        let afterShareBal = await this.sfUSDC.balanceOf(this.account_1.address);

        expect(
          BigInt(afterUnderlyingBal) - BigInt(beforeUnderlyingBal)
        ).to.be.equal(BigInt(expectRedeemAmount));
        expect(BigInt(beforeShareBal) - BigInt(afterShareBal)).to.be.equal(
          BigInt(ownedShareAmount) / BigInt(2)
        );
      });
    });
  });

  describe("borrow", function () {
    let poolBalance, borrowAmount;
    it("get current supplied amount", async function () {
      poolBalance = await this.sfUSDC.getUnderlyingBalance();
      console.log("current PoolBalance: ", smallNum(poolBalance, 6));
      borrowAmount = BigInt(poolBalance) / BigInt(5);
    });

    it("reverts if borrower has not enough collateral", async function () {
      let borrowableAmount =
        await this.marketPositionManager.getBorrowableAmount(
          this.account_2.address,
          this.sfUSDC.address
        );
      expect(borrowableAmount).to.be.equal(0);
      await expect(
        this.sfUSDC.connect(this.account_2).borrow(BigInt(borrowAmount))
      ).to.be.revertedWith("under collateralized");
    });

    it("reverts if not enough supply pool even though borrower has enough collateral", async function () {
      let USDCBorrowableAmount =
        await this.marketPositionManager.getBorrowableAmount(
          this.account_1.address,
          this.sfUSDC.address
        );
      expect(smallNum(USDCBorrowableAmount, 6)).to.be.greaterThan(0);
      let borrowableWETHAmount = await this.dexRouter.getAmountsOut(
        BigInt(USDCBorrowableAmount),
        [param.USDCAddress, param.WETHAddress]
      );
      borrowableWETHAmount = borrowableWETHAmount[1];
      expect(smallNum(borrowableWETHAmount, 18)).to.be.greaterThan(0);

      expect(
        smallNum(
          await this.marketPositionManager.getBorrowableAmount(
            this.account_1.address,
            this.sfWETH.address
          ),
          18
        )
      ).to.be.equal(0);

      await expect(
        this.sfWETH.connect(this.account_1).borrow(BigInt(borrowableWETHAmount))
      ).to.be.revertedWith("insufficient pool amount to borrow");
    });

    it("supply WETH with account_2", async function () {
      let supplyAmount = bigNum(5, 18);
      await this.WETH.connect(this.account_2).deposit({
        value: BigInt(supplyAmount),
      });
      await this.WETH.connect(this.account_2).approve(
        this.sfWETH.address,
        BigInt(supplyAmount)
      );
      await this.sfWETH
        .connect(this.account_2)
        .supplyUnderlying(BigInt(supplyAmount));
    });

    it("check borrowable USDC amount", async function () {
      let supplyUSDCAmount = await this.sfUSDC.getUnderlyingBalance();
      let borrowableUSDCAmount =
        await this.marketPositionManager.getBorrowableAmount(
          this.account_2.address,
          this.sfUSDC.address
        );
      expect(BigInt(supplyUSDCAmount)).to.be.equal(
        BigInt(borrowableUSDCAmount)
      );
    });

    it("borrow USDC", async function () {
      let borrowableUSDCAmount =
        await this.marketPositionManager.getBorrowableAmount(
          this.account_2.address,
          this.sfUSDC.address
        );

      let beforeUSDCBal = await this.USDC.balanceOf(this.account_2.address);
      let [, beforeBorrowedAmount] = await this.sfUSDC.getAccountSnapshot(
        this.account_2.address
      );
      let beforeTotalBorrows = await this.sfUSDC.totalBorrows();
      let beforeTotalReserves = await this.sfUSDC.totalReserves();
      let beforeBorrowIndex = await this.sfUSDC.borrowIndex();
      let beforeSupplyRate = await this.sfUSDC.supplyRatePerBlock();
      expect(
        await this.marketPositionManager.checkMembership(
          this.account_2.address,
          this.sfUSDC.address
        )
      ).to.be.equal(false);
      await this.sfUSDC
        .connect(this.account_2)
        .borrow(BigInt(borrowableUSDCAmount));
      expect(
        await this.marketPositionManager.checkMembership(
          this.account_2.address,
          this.sfUSDC.address
        )
      ).to.be.equal(true);

      let afterSupplyRate = await this.sfUSDC.supplyRatePerBlock();
      let afterUSDCBal = await this.USDC.balanceOf(this.account_2.address);
      let [, afterBorrowedAmount] = await this.sfUSDC.getAccountSnapshot(
        this.account_2.address
      );
      let afterTotalBorrows = await this.sfUSDC.totalBorrows();
      let afterTotalReserves = await this.sfUSDC.totalReserves();
      let afterBorrowIndex = await this.sfUSDC.borrowIndex();

      let receviedUSDC = BigInt(afterUSDCBal) - BigInt(beforeUSDCBal);
      let borrowedAmount =
        BigInt(afterBorrowedAmount) - BigInt(beforeBorrowedAmount);
      let totalBorrows = BigInt(afterTotalBorrows) - BigInt(beforeTotalBorrows);
      let totalReserves =
        BigInt(afterTotalReserves) - BigInt(beforeTotalReserves);

      let feeAmount =
        (BigInt(bigNum(borrowableUSDCAmount, 12)) *
          BigInt(feeRate.borrowingFeeRate)) /
        BigInt(10000);
      let expectAmount = BigInt(borrowedAmount) - BigInt(feeAmount);

      expect(smallNum(afterBorrowIndex, 18)).to.be.greaterThan(
        smallNum(beforeBorrowIndex, 18)
      );

      expect(smallNum(receviedUSDC, 6)).to.be.closeTo(
        smallNum(expectAmount, 18),
        0.0001
      );
      expect(smallNum(totalBorrows, 18)).to.be.equal(
        smallNum(borrowableUSDCAmount, 6)
      );
      expect(BigInt(totalReserves)).to.be.equal(BigInt(0));
      expect(smallNum(borrowedAmount, 18)).to.be.equal(
        smallNum(borrowableUSDCAmount, 6)
      );

      expect(
        await this.marketPositionManager.getBorrowableAmount(
          this.account_2.address,
          this.sfUSDC.address
        )
      ).to.be.equal(0);

      expect(Number(afterSupplyRate)).to.be.greaterThan(
        Number(beforeSupplyRate)
      );
    });

    it("increase blockNumber and check borrowAmount", async function () {
      let [, beforeBorrowedAmount] = await this.sfUSDC.getAccountSnapshot(
        this.account_2.address
      );

      let beforeClaimableInterests = await this.sfUSDC.getClaimableInterests(
        this.account_1.address
      );

      await increaseBlock(28800);
      let [, afterBorrowedAmount] = await this.sfUSDC.getAccountSnapshot(
        this.account_2.address
      );
      let afterClaimableInterests = await this.sfUSDC.getClaimableInterests(
        this.account_1.address
      );

      expect(smallNum(afterBorrowedAmount, 6)).to.be.greaterThan(
        smallNum(beforeBorrowedAmount, 6)
      );

      expect(smallNum(afterClaimableInterests, 6)).to.be.greaterThan(
        smallNum(beforeClaimableInterests, 6)
      );
    });

    it("reverts if not insufficient pool to provide interests", async function () {
      await expect(
        this.sfUSDC.connect(this.account_1).claimInterests()
      ).to.be.revertedWith("not insufficient balance for interests");
    });
  });

  describe("repayBorrow", function () {
    describe("repayBorrow", function () {
      it("reverts if no repayAmount", async function () {
        let [shareAmount, repayAmount] = await this.sfUSDC.getAccountSnapshot(
          this.account_2.address
        );
        repayAmount = BigInt(repayAmount) * BigInt(2);

        await expect(
          this.sfUSDC.connect(this.account_1).repayBorrow(BigInt(repayAmount))
        ).to.be.revertedWith("no borrows to repay");
      });

      it("get debt amount", async function () {
        let [shareAmount, beforeRepayAmount] =
          await this.sfUSDC.getAccountSnapshot(this.account_2.address);
        let repayAmount =
          BigInt(beforeRepayAmount) / BigInt(bigNum(1, 12)) / BigInt(2);
        await this.USDC.connect(this.account_1).transfer(
          this.account_2.address,
          BigInt(repayAmount)
        );
        await this.USDC.connect(this.account_2).approve(
          this.sfUSDC.address,
          BigInt(repayAmount)
        );
        await this.sfUSDC
          .connect(this.account_2)
          .repayBorrow(BigInt(repayAmount));

        let [, afterRepayAmount] = await this.sfUSDC.getAccountSnapshot(
          this.account_2.address
        );

        expect(
          smallNum(BigInt(beforeRepayAmount) - BigInt(afterRepayAmount), 18)
        ).to.be.closeTo(smallNum(repayAmount, 6), 0.01);
      });
    });

    describe("repayBorrowBehalf", async function () {
      it("reverts if no repayAmount", async function () {
        let [shareAmount, repayAmount] = await this.sfUSDC.getAccountSnapshot(
          this.account_2.address
        );
        repayAmount = BigInt(repayAmount) * BigInt(2);

        await expect(
          this.sfUSDC
            .connect(this.account_2)
            .repayBorrowBehalf(this.account_1.address, BigInt(repayAmount))
        ).to.be.revertedWith("no borrows to repay");
      });

      it("get debt amount", async function () {
        let [shareAmount, beforeRepayAmount] =
          await this.sfUSDC.getAccountSnapshot(this.account_2.address);
        let repayAmount = BigInt(beforeRepayAmount) * BigInt(2);
        let beforeBal = await this.USDC.balanceOf(this.account_1.address);
        await this.USDC.connect(this.account_1).approve(
          this.sfUSDC.address,
          BigInt(repayAmount)
        );
        await this.sfUSDC
          .connect(this.account_1)
          .repayBorrowBehalf(this.account_2.address, BigInt(repayAmount));
        let afterBal = await this.USDC.balanceOf(this.account_1.address);

        let [, afterRepayAmount] = await this.sfUSDC.getAccountSnapshot(
          this.account_2.address
        );
        let repaidAmount = BigInt(beforeBal) - BigInt(afterBal);

        expect(smallNum(afterRepayAmount, 18)).to.be.closeTo(0, 0.000001);
        expect(smallNum(beforeRepayAmount, 18)).to.be.closeTo(
          smallNum(repaidAmount, 6),
          0.0001
        );
      });
    });

    describe("claimInterests", function () {
      it("claimInterests and check", async function () {
        let claimableInterests = await this.sfUSDC.getClaimableInterests(
          this.account_1.address
        );
        let beforeBal = await this.USDC.balanceOf(this.account_1.address);
        let beforeSuppliedAmount = await this.sfUSDC.getSuppliedAmount(
          this.account_1.address
        );
        let beforeOwnerBal = await this.USDC.balanceOf(this.deployer.address);

        await this.sfUSDC.connect(this.account_1).claimInterests();

        let afterBal = await this.USDC.balanceOf(this.account_1.address);
        let afterSuppliedAmount = await this.sfUSDC.getSuppliedAmount(
          this.account_1.address
        );
        let afterOwnerBal = await this.USDC.balanceOf(this.deployer.address);

        let supplierAmount = BigInt(afterBal) - BigInt(beforeBal);
        let ownerAmount = BigInt(afterOwnerBal) - BigInt(beforeOwnerBal);

        expect(smallNum(claimableInterests, 6)).to.be.equal(
          smallNum(BigInt(supplierAmount) + BigInt(ownerAmount), 6)
        );
        expect(smallNum(beforeSuppliedAmount, 6)).to.be.equal(
          smallNum(afterSuppliedAmount, 6)
        );
      });
    });
  });

  describe("liquidateBorrow", function () {
    it("reverts if caller is borrower", async function () {
      await expect(
        this.sfUSDC
          .connect(this.account_2)
          .liquidateBorrow(
            this.account_2.address,
            this.sfWETH.address,
            BigInt(bigNum(10, 6))
          )
      ).to.be.revertedWith("can not liquidate own borrows");
    });

    it("reverts if amount is zero", async function () {
      await expect(
        this.sfUSDC
          .connect(this.account_1)
          .liquidateBorrow(this.account_2.address, this.sfWETH.address, 0)
      ).to.be.revertedWith("invalid liquidate amount");
    });

    it("borrow WETH", async function () {
      let borrowableAmount =
        await this.marketPositionManager.getBorrowableAmount(
          this.account_1.address,
          this.sfWETH.address
        );
      expect(smallNum(borrowableAmount, 18)).to.be.greaterThan(0);

      let feeAmount =
        (BigInt(borrowableAmount) * BigInt(feeRate.borrowingFeeRate)) /
        BigInt(10000);
      let expectAmount = BigInt(borrowableAmount) - BigInt(feeAmount);
      let beforeBal = await this.WETH.balanceOf(this.account_1.address);
      await this.sfWETH
        .connect(this.account_1)
        .borrow(BigInt(borrowableAmount));
      let afterBal = await this.WETH.balanceOf(this.account_1.address);

      expect(smallNum(BigInt(afterBal) - BigInt(beforeBal), 18)).to.be.closeTo(
        smallNum(expectAmount, 18),
        0.001
      );
    });

    it("liquidableAmount", async function () {
      let [, borrowedAmount] = await this.sfWETH.getAccountSnapshot(
        this.account_1.address
      );
      let liquidableAmount =
        await this.marketPositionManager.getLiquidableAmount(
          this.sfWETH.address,
          this.account_1.address
        );

      expect(smallNum(borrowedAmount, 18)).to.be.greaterThan(0);
      expect(smallNum(liquidableAmount, 18)).to.be.equal(0);

      // pass 2 years
      let passTime = year * 2;
      let blockCount = BigInt(passTime) / BigInt(3);
      await increaseBlock(BigInt(blockCount));

      [, borrowedAmount] = await this.sfWETH.getAccountSnapshot(
        this.account_1.address
      );
      liquidableAmount = await this.marketPositionManager.getLiquidableAmount(
        this.sfWETH.address,
        this.account_1.address
      );

      expect(smallNum(borrowedAmount, 18)).to.be.greaterThan(0);
      expect(smallNum(borrowedAmount, 18)).to.be.equal(
        smallNum(liquidableAmount, 18)
      );
    });

    it("reverts borrow if borrow amount exceeds collateral limit", async function () {
      await expect(
        this.sfWETH.connect(this.account_1).borrow(bigNum(100, 18))
      ).to.be.revertedWith("under collateralized");
    });

    it("reverts if liquidateAmount is too much", async function () {
      let wrapAmount = bigNum(5, 18);
      await this.WETH.connect(this.account_3).deposit({
        value: BigInt(wrapAmount),
      });

      await this.WETH.connect(this.account_3).approve(
        this.sfWETH.address,
        BigInt(wrapAmount)
      );

      await expect(
        this.sfWETH
          .connect(this.account_3)
          .liquidateBorrow(
            this.account_1.address,
            this.sfWETH.address,
            BigInt(wrapAmount)
          )
      ).to.be.revertedWith("too much to liquidate");
    });

    it("reverts if borrower doesn't have enough share", async function () {
      let liquidableAmount =
        await this.marketPositionManager.getLiquidableAmount(
          this.sfWETH.address,
          this.account_1.address
        );

      let liquidableAmounntWithSeizeToken =
        await this.marketPositionManager.getLiquidableAmountWithSeizeToken(
          this.sfWETH.address,
          this.sfWETH.address,
          this.account_1.address
        );
      expect(liquidableAmounntWithSeizeToken).to.be.equal(0);

      await expect(
        this.sfWETH
          .connect(this.account_3)
          .liquidateBorrow(
            this.account_1.address,
            this.sfWETH.address,
            BigInt(liquidableAmount)
          )
      ).to.be.revertedWith("insufficient borrower balance for liquidate");
    });

    it("liquidate and check", async function () {
      let liquidableAmount =
        await this.marketPositionManager.getLiquidableAmountWithSeizeToken(
          this.sfWETH.address,
          this.sfUSDC.address,
          this.account_1.address
        );
      let beforeBorrowerUSDCShare = await this.sfUSDC.balanceOf(
        this.account_1.address
      );
      let beforeLiquidatorUSDCShare = await this.sfUSDC.balanceOf(
        this.account_3.address
      );
      let beforeWETHBal = await this.WETH.balanceOf(this.account_3.address);
      let beforeTotalReserves = await this.sfUSDC.totalReserves();
      await this.sfWETH
        .connect(this.account_3)
        .liquidateBorrow(
          this.account_1.address,
          this.sfUSDC.address,
          BigInt(liquidableAmount)
        );
      let afterBorrowerUSDCShare = await this.sfUSDC.balanceOf(
        this.account_1.address
      );
      let afterLiquidatorUSDCShare = await this.sfUSDC.balanceOf(
        this.account_3.address
      );
      let afterWETHBal = await this.WETH.balanceOf(this.account_3.address);
      let afterTotalReserves = await this.sfUSDC.totalReserves();

      expect(smallNum(afterBorrowerUSDCShare, 18)).to.be.closeTo(0, 0.000001);

      let liquidatedShare =
        BigInt(beforeBorrowerUSDCShare) - BigInt(afterBorrowerUSDCShare);
      let protocolSeizeShareMantissa =
        await this.sfUSDC.protocolSeizeShareMantissa();
      let protocolShare =
        (BigInt(liquidatedShare) * BigInt(protocolSeizeShareMantissa)) /
        BigInt(bigNum(1, 18));
      let expectShare = BigInt(liquidatedShare) - BigInt(protocolShare);

      expect(
        smallNum(
          BigInt(afterLiquidatorUSDCShare) - BigInt(beforeLiquidatorUSDCShare),
          18
        )
      ).to.be.equal(smallNum(expectShare, 18));

      expect(BigInt(beforeWETHBal) - BigInt(afterWETHBal)).to.be.equal(
        BigInt(liquidableAmount)
      );
      expect(
        smallNum(BigInt(afterTotalReserves) - BigInt(beforeTotalReserves), 18)
      ).to.be.greaterThan(0);
    });
  });

  describe("sweepToken", function () {
    it("reverts if caller is not the owner", async function () {
      await expect(
        this.sfUSDC.connect(this.account_1).sweepToken(this.WETH.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if try to sweep with underlying token", async function () {
      await expect(
        this.sfUSDC.sweepToken(this.USDC.address)
      ).to.be.revertedWith("can not sweep underlying token");
    });

    it("sweepToken and check", async function () {
      let amount = await this.USDC.balanceOf(this.account_1.address);
      await this.USDC.connect(this.account_1).transfer(
        this.sfWETH.address,
        BigInt(amount)
      );

      let beforeBal = await this.USDC.balanceOf(this.deployer.address);
      await this.sfWETH.sweepToken(this.USDC.address);
      let afterBal = await this.USDC.balanceOf(this.deployer.address);

      expect(smallNum(BigInt(afterBal) - BigInt(beforeBal), 6)).to.be.equal(
        smallNum(amount, 6)
      );
    });
  });

  describe("check fetch data", function () {
    it("supply & borrow USDC", async function () {
      // supply USDC by account_1
      await this.dexRouter
        .connect(this.account_1)
        .swapExactETHForTokens(
          0,
          [param.WETHAddress, this.USDC.address],
          this.account_1.address,
          BigInt(await getCurrentTimestamp()) + BigInt(100),
          { value: bigNum(1, 18) }
        );

      let supplyAmount = await this.USDC.balanceOf(this.account_1.address);
      console.log("supplied amount: ", smallNum(supplyAmount, 6));
      await this.USDC.connect(this.account_1).approve(
        this.sfUSDC.address,
        BigInt(supplyAmount)
      );
      await this.sfUSDC
        .connect(this.account_1)
        .supplyUnderlying(BigInt(supplyAmount));

      // borrow USDC by account_3
      let borrowAmount = await this.marketPositionManager.getBorrowableAmount(
        this.account_3.address,
        this.sfUSDC.address
      );
      console.log("borrowableAmount: ", smallNum(borrowAmount, 6));
      borrowAmount = BigInt(borrowAmount) / BigInt(2);

      await this.sfUSDC.connect(this.account_3).borrow(BigInt(borrowAmount));

      let supplyRate = await this.sfUSDC.supplyRatePerBlock();
      console.log(supplyRate);
      expect(Number(supplyRate)).to.be.greaterThan(0);
    });

    it("supplied amount", async function () {
      let beforeSuppliedAmount = await this.sfUSDC.getSuppliedAmount(
        this.account_1.address
      );
      let [, beforeTotalReserves] = await this.sfUSDC.getUpdatedRates();

      await increaseBlock(param.interestRate.blocksPerYear);

      let afterSuppliedAmount = await this.sfUSDC.getSuppliedAmount(
        this.account_1.address
      );
      let [, afterTotalReserves] = await this.sfUSDC.getUpdatedRates();

      console.log(
        "before and after supplied amount: ",
        smallNum(beforeSuppliedAmount, 6),
        smallNum(afterSuppliedAmount, 6)
      );

      let rewards = BigInt(afterSuppliedAmount) - BigInt(beforeSuppliedAmount);

      let supplyRate = await this.sfUSDC.supplyRatePerBlock();
      let borrowRate = await this.sfUSDC.borrowRatePerBlock();

      console.log(smallNum(rewards, 6));
      console.log(
        BigInt(supplyRate),
        BigInt(borrowRate),
        BigInt(supplyRate) - BigInt(borrowRate)
      );
    });
  });
});
