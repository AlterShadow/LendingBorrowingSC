// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.17;

interface ISFProtocolToken {
    struct FeeRate {
        uint16 borrowingFeeRate;
        uint16 redeemingFeeRate;
        uint16 claimingFeeRate;
    }

    /// @notice Container for borrow balance information
    /// @member principal Total balance (with accrued interest), after applying the most recent balance-changing action
    /// @member interestIndex Global borrowIndex as of the most recent balance-changing action
    struct BorrowSnapshot {
        uint principal;
        uint interestIndex;
    }

    struct SupplySnapshot {
        uint256 principal;
        uint256 claimed;
    }

    /// @notice The address of marketPositionManager.
    function marketPositionManager() external view returns (address);

    /// @notice Get the address of underlying.
    function underlyingToken() external view returns (address);

    /// @notice Total amount of outstanding borrows of the underlying in this market
    function totalBorrows() external view returns (uint256);

    /// @notice Get underlying balance of SFProtocol token.
    function getUnderlyingBalance() external view returns (uint256);

    /// @notice Get account's shareBalance, borrowedAmount and exchangeRate.
    function getAccountSnapshot(
        address _account
    ) external view returns (uint256, uint256, uint256);

    /// @notice Get exchangeRate.
    function getExchangeRateStored() external view returns (uint256);

    /// @notice Supply underlying assets to lending pool.
    /// @dev Reverts when contract is paused.
    /// @param _underlyingAmount The amount of underlying asset.
    function supplyUnderlying(uint256 _underlyingAmount) external;

    /// @notice Redeem underlying asset by burning SF token(shares).
    /// @dev Reverts when contract is paused.
    /// @param _shareAmount The amount of SF token(shares) for redeem.
    function redeem(uint256 _shareAmount) external;

    /// @notice Redeem exact underlying asset.
    /// @dev Reverts when contract is paused.
    /// @param _underlyingAmount The amount of underlying asset that want to redeem.
    function redeemExactUnderlying(uint256 _underlyingAmount) external;

    /// @notice Borrow underlying assets from lending pool.
    /// @dev Reverts when contract is paused.
    /// @param _underlyingAmount The amount of underlying to borrow.
    function borrow(uint256 _underlyingAmount) external;

    /// @notice Claim interests.
    function claimInterests() external;

    /// @notice Repay borrowed underlying assets and get back SF token(shares).
    /// @param _repayAmount The amount of underlying assets to repay.
    function repayBorrow(uint256 _repayAmount) external;

    /// @notice Sender repays a borrow belonging to borrower
    /// @param _borrower the account with the debt being payed off
    /// @param _repayAmount The amount to repay, or -1 for the full outstanding amount
    function repayBorrowBehalf(
        address _borrower,
        uint256 _repayAmount
    ) external;

    /// @notice Liquidate borrowed underlying assets instead of borrower.
    /// @param _borrower The address of borrower.
    /// @param _collateralToken The address of token to seize.
    /// @param _repayAmount The amount of underlying assert to liquidate.
    function liquidateBorrow(
        address _borrower,
        address _collateralToken,
        uint256 _repayAmount
    ) external;

    /// @notice Transfers collateral tokens (this market) to the liquidator.
    /// @dev Will fail unless called by another cToken during the process of liquidation.
    ///  Its absolutely critical to use msg.sender as the borrowed cToken and not a parameter.
    /// @param _liquidator The account receiving seized collateral
    /// @param _borrower The account having collateral seized
    /// @param _seizeTokens The number of cTokens to seize
    function seize(
        address _liquidator,
        address _borrower,
        uint256 _seizeTokens
    ) external;

    /// @notice Sweep tokens.
    /// @dev Only owner can call this function and tokes will send to owner.
    /// @param _token The address of token to sweep.
    function sweepToken(address _token) external;

    /// @notice Get supplied underlying token amount of an user.
    function getSuppliedAmount(
        address _account
    ) external view returns (uint256);

    /// @notice Returns the current per-block borrow interest rate for this cToken
    /// @return The supply interest rate per block, scaled by 1e18
    function borrowRatePerBlock() external view returns (uint256);

    /// @notice Returns the current per-block supply interest rate for this cToken
    /// @return The supply interest rate per block, scaled by 1e18
    function supplyRatePerBlock() external view returns (uint256);

    /// @notice Convert amount of underlying token to share amount.
    function convertUnderlyingToShare(
        uint256 _amount
    ) external view returns (uint256);

    /// @notice Convert 18 decimals amount to underlying.
    function convertToUnderlying(
        uint256 _amount
    ) external view returns (uint256);

    /// @notice Pause contract when critical error occurs.
    /// @dev Only owner can call this function.
    function pause() external;

    /// @notice Unpause contract after fixed errors.
    /// @dev Only owner can call this function.
    function unpause() external;

    event InterestAccrued();

    event InterestsClaimed(address supplier, uint256 claimedAmount);

    event UnderlyingSupplied(
        address supplier,
        uint256 underlyingAmount,
        uint256 shareAmount
    );

    event Borrow(
        address borrower,
        uint borrowAmount,
        uint accountBorrows,
        uint totalBorrows
    );

    event RepayBorrow(
        address payer,
        address borrower,
        uint repayAmount,
        uint accountBorrows,
        uint totalBorrows
    );

    event ReservesAdded(
        address benefactor,
        uint addAmount,
        uint newTotalReserves
    );

    event LiquidateBorrow(
        address liquidator,
        address borrower,
        uint repayAmount,
        address cTokenCollateral,
        uint seizeTokens
    );
}
