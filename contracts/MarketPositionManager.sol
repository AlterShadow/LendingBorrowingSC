// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/ISFProtocolToken.sol";
import "./interfaces/IMarketPositionManager.sol";

contract MarketPositionManager is OwnableUpgradeable, IMarketPositionManager {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Reflect if borrow is allowed.
    mapping(address => bool) public borrowGuardianPaused;

    /// @notice Reflect if supply is allowed.
    mapping(address => bool) public supplyGuardianPaused;

    /// @notice Reflect market information.
    mapping(address => MarketInfo) private markets;

    /// @notice Limit amounts by each token.
    /// @dev 0 means unlimit borrow.
    mapping(address => uint256) public borrowCaps;

    /// @notice Assets array that a user borrowed.
    mapping(address => EnumerableSet.AddressSet) private accountAssets;

    /// @notice Multiplier representing the discount on collateral that a liquidator receives
    uint256 public liquidationIncentiveMantissa;

    /// @notice The max liquidate rate based on borrowed amount.
    uint16 public maxLiquidateRate;

    /// @notice 10,000 = 100%
    uint16 public constant FIXED_RATE = 10_000;

    IPriceOracle public priceOracle;

    modifier onlyValidCaller(address _token) {
        require(msg.sender == _token, "invalid caller");
        require(markets[_token].isListed, "not listed token");
        _;
    }

    function initialize(
        address _priceOracle,
        uint16 _maxLiquidateRate
    ) public initializer {
        __Ownable_init();
        setPriceOracle(_priceOracle);
        setMaxLiquidateRate(_maxLiquidateRate);
        liquidationIncentiveMantissa = 1e18;
    }

    /// @inheritdoc IMarketPositionManager
    function setPriceOracle(address _priceOracle) public override onlyOwner {
        require(
            _priceOracle != address(0),
            "invalid PriceOracle contract address"
        );
        priceOracle = IPriceOracle(_priceOracle);
    }

    /// @inheritdoc IMarketPositionManager
    function pauseBorrowGuardian(
        address[] memory _tokens,
        bool _pause
    ) external override onlyOwner {
        uint256 length = _tokens.length;
        require(length > 0, "invalid array length");
        for (uint256 i = 0; i < length; i++) {
            borrowGuardianPaused[_tokens[i]] = _pause;
        }
    }

    /// @inheritdoc IMarketPositionManager
    function pauseSupplyGuardian(
        address[] memory _tokens,
        bool _pause
    ) external override onlyOwner {
        uint256 length = _tokens.length;
        require(length > 0, "invalid arrray length");
        for (uint256 i = 0; i < length; i++) {
            supplyGuardianPaused[_tokens[i]] = _pause;
        }
    }

    /// @inheritdoc IMarketPositionManager
    function setBorrowCaps(
        address[] memory _tokens,
        uint256[] memory _borrowCaps
    ) external override onlyOwner {
        uint256 length = _tokens.length;
        require(
            length > 0 && length == _borrowCaps.length,
            "invalid array length"
        );
        for (uint256 i = 0; i < length; i++) {
            borrowCaps[_tokens[i]] = _borrowCaps[i];
        }
    }

    /// @inheritdoc IMarketPositionManager
    function setLiquidationIncentive(
        uint256 _liquidiateIncentive
    ) external override onlyOwner {
        liquidationIncentiveMantissa = _liquidiateIncentive;
    }

    /// @inheritdoc IMarketPositionManager
    function checkMembership(
        address _account,
        address _token
    ) external view override returns (bool) {
        return markets[_token].accountMembership[_account];
    }

    /// @inheritdoc IMarketPositionManager
    function setMaxLiquidateRate(
        uint16 _newMaxLiquidateRate
    ) public override onlyOwner {
        require(_newMaxLiquidateRate <= FIXED_RATE, "invalid maxLiquidateRate");
        maxLiquidateRate = _newMaxLiquidateRate;
        emit NewMaxLiquidateRateSet(_newMaxLiquidateRate);
    }

    /// @inheritdoc IMarketPositionManager
    function addToMarket(address _token) external override onlyOwner {
        MarketInfo storage info = markets[_token];
        require(!info.isListed, "already added");
        info.isListed = true;
    }

    /// @inheritdoc IMarketPositionManager
    function validateSupply(
        address _supplier,
        address _token
    ) external override onlyValidCaller(_token) {
        require(!supplyGuardianPaused[_token], "supplying is paused");
        if (!accountAssets[_supplier].contains(_token)) {
            accountAssets[_supplier].add(_token);
        }
    }

    /// @inheritdoc IMarketPositionManager
    function checkListedToken(
        address _token
    ) external view override returns (bool) {
        return markets[_token].isListed;
    }

    bool public seizeGuardianPaused;

    /// @inheritdoc IMarketPositionManager
    function validateSeize(
        address _seizeToken,
        address _borrowToken
    ) external view override {
        require(!seizeGuardianPaused, "seize is paused");
        require(
            markets[_seizeToken].isListed && markets[_borrowToken].isListed,
            "not listed token"
        );
        require(
            ISFProtocolToken(_seizeToken).marketPositionManager() ==
                ISFProtocolToken(_borrowToken).marketPositionManager(),
            "mismatched markeManagerPosition"
        );
    }

    /// @inheritdoc IMarketPositionManager
    function liquidateCalculateSeizeTokens(
        address _borrowToken,
        address _seizeToken,
        uint256 _repayAmount
    ) public view override returns (uint256) {
        uint256 borrowTokenPrice = priceOracle.getUnderlyingPrice(_borrowToken);
        uint256 seizeTokenPrice = priceOracle.getUnderlyingPrice(_seizeToken);

        require(borrowTokenPrice > 0 && seizeTokenPrice > 0, "price error");

        uint256 exchangeRate = ISFProtocolToken(_seizeToken)
            .getExchangeRateStored();

        uint256 borrowIncentive = liquidationIncentiveMantissa *
            borrowTokenPrice;
        uint256 collateralIncentive = seizeTokenPrice * exchangeRate;

        uint256 ratio = (borrowIncentive * 1e18) / collateralIncentive;
        uint256 seizeTokens = (ratio * _repayAmount) / 1e18;

        return seizeTokens;
    }

    /// @inheritdoc IMarketPositionManager
    function getLiquidableAmountWithSeizeToken(
        address _borrowToken,
        address _seizeToken,
        address _borrower
    ) external view override returns (uint256) {
        (, uint256 borrowAmount, ) = ISFProtocolToken(_borrowToken)
            .getAccountSnapshot(_borrower);
        if (!markets[_borrowToken].isListed || !markets[_seizeToken].isListed) {
            return 0;
        }

        uint256 liquidableAmount;
        if (borrowGuardianPaused[_borrowToken]) {
            liquidableAmount = borrowAmount;
        } else {
            bool validation = _checkValidation(_borrower, _borrowToken, 0, 0);
            liquidableAmount = validation
                ? 0
                : ((borrowAmount * maxLiquidateRate) / FIXED_RATE);
        }

        uint256 borrowTokenPrice = priceOracle.getUnderlyingPrice(_borrowToken);
        uint256 seizeTokenPrice = priceOracle.getUnderlyingPrice(_seizeToken);

        require(borrowTokenPrice > 0 && seizeTokenPrice > 0, "price error");

        uint256 exchangeRate = ISFProtocolToken(_seizeToken)
            .getExchangeRateStored();
        uint256 borrowIncentive = liquidationIncentiveMantissa *
            borrowTokenPrice;
        uint256 collateralIncentive = seizeTokenPrice * exchangeRate;
        uint256 ratio = (borrowIncentive * 1e18) / collateralIncentive;

        uint256 seizeTokenAmount = IERC20(_seizeToken).balanceOf(_borrower);
        liquidableAmount = (seizeTokenAmount * 1e18) / ratio;
        liquidableAmount = ISFProtocolToken(_borrowToken).convertToUnderlying(
            liquidableAmount
        );

        return liquidableAmount;
    }

    /// @inheritdoc IMarketPositionManager
    function getLiquidableAmount(
        address _borrowToken,
        address _borrower
    ) external view override returns (uint256) {
        (, uint256 borrowAmount, ) = ISFProtocolToken(_borrowToken)
            .getAccountSnapshot(_borrower);
        if (!markets[_borrowToken].isListed) {
            return 0;
        }

        uint256 liquidableAmount;
        if (borrowGuardianPaused[_borrowToken]) {
            liquidableAmount = borrowAmount;
        } else {
            bool validation = _checkValidation(_borrower, _borrowToken, 0, 0);
            liquidableAmount = validation
                ? 0
                : ((borrowAmount * maxLiquidateRate) / FIXED_RATE);
        }

        return liquidableAmount;
    }

    /// @inheritdoc IMarketPositionManager
    function validateLiquidate(
        address _tokenBorrowed,
        address _tokenSeize,
        address _borrower,
        uint256 _liquidateAmount
    ) external view {
        require(
            markets[_tokenBorrowed].isListed && markets[_tokenSeize].isListed,
            "not listed token"
        );

        (, uint256 borrowAmount, ) = ISFProtocolToken(_tokenBorrowed)
            .getAccountSnapshot(_borrower);

        if (borrowGuardianPaused[_tokenBorrowed]) {
            require(
                borrowAmount >= _liquidateAmount,
                "can not liquidate more than borrowed"
            );
        } else {
            // To liquidate, borrower should be under collateralized.
            require(
                !_checkValidation(_borrower, _tokenBorrowed, 0, 0),
                "unable to liquidate"
            );

            uint256 maxLiquidateAmount = (borrowAmount * maxLiquidateRate) /
                FIXED_RATE;
            require(
                maxLiquidateAmount > _liquidateAmount,
                "too much to liquidate"
            );
        }
    }

    /// @inheritdoc IMarketPositionManager
    function validateBorrow(
        address _token,
        address _borrower,
        uint256 _borrowAmount
    ) external override onlyValidCaller(_token) returns (bool) {
        MarketInfo storage info = markets[_token];
        require(!borrowGuardianPaused[_token], "borrow is paused");

        if (!info.accountMembership[_borrower]) {
            // if borrower didn't ever borrow, nothing else
            info.accountMembership[_borrower] = true;
            if (!accountAssets[_borrower].contains(_token)) {
                accountAssets[_borrower].add(_token);
            }
        }

        uint256 borrowCap = borrowCaps[_token];
        if (borrowCap > 0) {
            uint256 totalBorrows = ISFProtocolToken(_token).totalBorrows();
            require(
                totalBorrows + _borrowAmount <= borrowCap,
                "market borrow cap reached"
            );
        }

        require(
            _checkValidation(_borrower, _token, 0, _borrowAmount),
            "under collateralized"
        );

        return true;
    }

    /// @inheritdoc IMarketPositionManager
    function validateRedeem(
        address _token,
        address _redeemer,
        uint256 _redeemAmount
    ) external view override onlyValidCaller(_token) returns (bool) {
        MarketInfo storage info = markets[_token];

        if (!info.accountMembership[_redeemer]) {
            return true;
        }

        require(
            _checkValidation(_redeemer, _token, _redeemAmount, 0),
            "under collateralized"
        );

        return true;
    }

    /// @notice Get borrowable underlying token amount by a user.
    /// @param _account The address of borrower.
    /// @param _token The address of sfToken.
    function getBorrowableAmount(
        address _account,
        address _token
    ) external view override returns (uint256) {
        uint256 borrowCap = borrowCaps[_token];
        uint256 totalBorrows = ISFProtocolToken(_token).totalBorrows();
        address[] memory assets = accountAssets[_account].values();
        uint256 length = assets.length;
        if (
            borrowGuardianPaused[_token] ||
            (borrowCap > 0 && totalBorrows >= borrowCap)
        ) {
            return 0;
        }

        uint256 totalCollateral = 0;
        uint256 totalDebt = 0;
        address account = _account;
        address token = _token;
        uint256 borrowTokenPrice;
        uint256 availableCollateral;

        uint256 accountCollateral;
        uint256 accountDebt;
        for (uint256 i = 0; i < length; i++) {
            uint256 price;
            address asset = assets[i];
            (accountCollateral, accountDebt, price) = _calCollateralAndDebt(
                account,
                asset,
                0,
                0
            );

            if (asset == token) {
                borrowTokenPrice = price;
            }

            totalCollateral += accountCollateral;
            totalDebt += accountDebt;
        }

        if (!accountAssets[account].contains(token)) {
            (
                accountCollateral,
                accountDebt,
                borrowTokenPrice
            ) = _calCollateralAndDebt(account, token, 0, 0);

            totalCollateral += accountCollateral;
            totalDebt += accountDebt;
        }

        availableCollateral = totalDebt >= totalCollateral
            ? 0
            : totalCollateral - totalDebt;

        uint256 borrowableAmount = (availableCollateral * 1e18) /
            borrowTokenPrice;
        uint256 poolAmount = ISFProtocolToken(token).getUnderlyingBalance();
        poolAmount = ISFProtocolToken(token).convertUnderlyingToShare(
            poolAmount
        );
        borrowableAmount = borrowableAmount > poolAmount
            ? poolAmount
            : borrowableAmount;

        return ISFProtocolToken(_token).convertToUnderlying(borrowableAmount);
    }

    function _checkValidation(
        address _account,
        address _token,
        uint256 _redeemAmount,
        uint256 _borrowAmount
    ) internal view returns (bool) {
        address[] memory assets = accountAssets[_account].values();
        uint256 length = assets.length;

        uint256 totalCollateral = 0;
        uint256 totalDebt = 0;
        uint256 redeemAmount = _redeemAmount;
        uint256 borrowAmount = _borrowAmount;
        address account = _account;
        address token = _token;
        for (uint256 i = 0; i < length; i++) {
            address asset = assets[i];
            (
                uint256 accountCollateral,
                uint256 accountDebt,

            ) = _calCollateralAndDebt(
                    account,
                    assets[i],
                    asset == token ? borrowAmount : 0,
                    asset == token ? redeemAmount : 0
                );

            totalCollateral += accountCollateral;
            totalDebt += accountDebt;
        }

        if (!accountAssets[account].contains(token)) {
            (
                uint256 accountCollateral,
                uint256 accountDebt,

            ) = _calCollateralAndDebt(
                    account,
                    token,
                    borrowAmount,
                    redeemAmount
                );

            totalCollateral += accountCollateral;
            totalDebt += accountDebt;
        }

        return totalCollateral > totalDebt;
    }

    function _calCollateralAndDebt(
        address _account,
        address _token,
        uint256 _borrowAmount,
        uint256 _redeemAmount
    )
        internal
        view
        returns (
            uint256 accountCollateral,
            uint256 accountDebt,
            uint256 tokenPrice
        )
    {
        ISFProtocolToken asset = ISFProtocolToken(_token);
        (
            uint256 shareBalance,
            uint256 borrowedAmount,
            uint256 exchangeRate
        ) = asset.getAccountSnapshot(_account);

        tokenPrice = priceOracle.getUnderlyingPrice(address(asset));
        require(tokenPrice > 0, "price error");

        // accountCollateral is USD amount of user supplied
        accountCollateral = (exchangeRate * shareBalance) / 1e18;
        accountCollateral = (accountCollateral * tokenPrice) / 1e18;

        // accountDebt is USD amount of user should pay
        accountDebt =
            (tokenPrice * (borrowedAmount + _redeemAmount + _borrowAmount)) /
            1e18;
    }
}
