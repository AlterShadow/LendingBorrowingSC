// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.17;

interface IInterestRateModel {
    /// @notice Update the parameters of the interest rate model (only callable by owner, i.e. Timelock)
    /// @param _baseRatePerYear The approximate target base APR, as a mantissa (scaled by 1e18)
    /// @param _multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by 1e18)
    /// @param _jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
    /// @param _kink The utilization point at which the jump multiplier is applied
    function updateJumpRateModel(
        uint256 _baseRatePerYear,
        uint256 _multiplierPerYear,
        uint256 _jumpMultiplierPerYear,
        uint256 _kink
    ) external;

    /// @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
    /// @param _cash The amount of cash in the market
    /// @param _borrows The amount of borrows in the market
    /// @param _reserves The amount of reserves in the market (currently unused)
    /// @return The utilization rate as a mantissa between [0, 1e18]
    function utilizationRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) external pure returns (uint256);

    /// @notice Updates the blocksPerYear in order to make interest calculations simpler
    /// @param _blocksPerYear The new estimated eth blocks per year.
    function updateBlocksPerYear(uint256 _blocksPerYear) external;

    /// @notice Calculates the current borrow rate per block, with the error code expected by the market
    /// @param _cash The amount of cash in the market
    /// @param _borrows The amount of borrows in the market
    /// @param _reserves The amount of reserves in the market
    /// @return The borrow rate percentage per block as a mantissa (scaled by 1e18)
    function getBorrowRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) external view returns (uint256);

    /// @notice Calculates the current supply rate per block
    /// @param _cash The amount of cash in the market
    /// @param _borrows The amount of borrows in the market
    /// @param _reserves The amount of reserves in the market
    /// @param _reserveFactorMantissa The current reserve factor for the market
    /// @return The supply rate percentage per block as a mantissa (scaled by 1e18)
    function getSupplyRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves,
        uint256 _reserveFactorMantissa
    ) external view returns (uint256);

    event NewInterestParams(
        uint256 baseRatePerBlock,
        uint256 multiplierPerBlock,
        uint256 jumpMultiplierPerBlock,
        uint256 kink
    );
}
