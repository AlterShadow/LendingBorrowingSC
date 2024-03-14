// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/IInterestRateModel.sol";

contract InterestRateModel is Ownable2Step, IInterestRateModel {
    /// @notice The approximate number of blocks per year that is assumed by the interest rate model
    uint256 public blocksPerYear;

    /// @notice The multiplier of utilization rate that gives the slope of the interest rate
    uint256 public multiplierPerBlock;

    /// @notice The base interest rate which is the y-intercept when utilization rate is 0
    uint256 public baseRatePerBlock;

    /// @notice The multiplierPerBlock after hitting a specified utilization point
    uint256 public jumpMultiplierPerBlock;

    /// @notice The utilization point at which the jump multiplier is applied
    uint256 public kink;

    /// @notice A name for user-friendliness, e.g. WBTC
    string public name;

    /// @notice Construct an interest rate model
    /// @param _baseRatePerYear The approximate target base APR, as a mantissa (scaled by 1e18)
    /// @param _multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by 1e18)
    /// @param _jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
    /// @param _kink The utilization point at which the jump multiplier is applied
    /// @param owner_ Sets the owner of the contract to someone other than msgSender
    /// @param _name User-friendly name for the new contract
    constructor(
        uint256 _blocksPerYear,
        uint256 _baseRatePerYear,
        uint256 _multiplierPerYear,
        uint256 _jumpMultiplierPerYear,
        uint256 _kink,
        address owner_,
        string memory _name
    ) {
        blocksPerYear = _blocksPerYear;
        name = _name;
        _transferOwnership(owner_);
        updateJumpRateModelInternal(
            _baseRatePerYear,
            _multiplierPerYear,
            _jumpMultiplierPerYear,
            _kink
        );
    }

    /// @inheritdoc IInterestRateModel
    function updateJumpRateModel(
        uint256 _baseRatePerYear,
        uint256 _multiplierPerYear,
        uint256 _jumpMultiplierPerYear,
        uint256 _kink
    ) external override onlyOwner {
        updateJumpRateModelInternal(
            _baseRatePerYear,
            _multiplierPerYear,
            _jumpMultiplierPerYear,
            _kink
        );
    }

    /// @inheritdoc IInterestRateModel
    function utilizationRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) public pure override returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (_borrows == 0) {
            return 0;
        }

        return (_borrows * 1e18) / (_cash + _borrows - _reserves);
    }

    /// @inheritdoc IInterestRateModel
    function updateBlocksPerYear(
        uint256 _blocksPerYear
    ) external override onlyOwner {
        blocksPerYear = _blocksPerYear;
    }

    /// @inheritdoc IInterestRateModel
    function getBorrowRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) public view override returns (uint256) {
        uint256 util = utilizationRate(_cash, _borrows, _reserves);

        if (util <= kink) {
            return (util * multiplierPerBlock) / 1e18 + baseRatePerBlock;
        } else {
            uint256 normalRate = (kink * multiplierPerBlock) /
                1e18 +
                baseRatePerBlock;
            uint256 excessUtil = util - kink;

            return (excessUtil * jumpMultiplierPerBlock) / 1e18 + normalRate;
        }
    }

    /// @inheritdoc IInterestRateModel
    function getSupplyRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves,
        uint256 _reserveFactorMantissa
    ) public view override returns (uint256) {
        uint256 oneMinusReserveFactor = uint256(1e18) - _reserveFactorMantissa;
        uint256 borrowRate = getBorrowRate(_cash, _borrows, _reserves);
        uint256 rateToPool = (borrowRate * oneMinusReserveFactor) / 1e18;
        return
            (utilizationRate(_cash, _borrows, _reserves) * rateToPool) / 1e18;
    }

    /// @notice Internal function to update the parameters of the interest rate model
    /// @param _baseRatePerYear The approximate target base APR, as a mantissa (scaled by 1e18)
    /// @param _multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by 1e18)
    /// @param _jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
    /// @param _kink The utilization point at which the jump multiplier is applied
    function updateJumpRateModelInternal(
        uint256 _baseRatePerYear,
        uint256 _multiplierPerYear,
        uint256 _jumpMultiplierPerYear,
        uint256 _kink
    ) internal {
        baseRatePerBlock = _baseRatePerYear / blocksPerYear;

        multiplierPerBlock =
            (_multiplierPerYear * 1e18) /
            (blocksPerYear * _kink);
        jumpMultiplierPerBlock = _jumpMultiplierPerYear / blocksPerYear;
        kink = _kink;

        emit NewInterestParams(
            baseRatePerBlock,
            multiplierPerBlock,
            jumpMultiplierPerBlock,
            kink
        );
    }
}
