// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/ISFProtocolToken.sol";

interface IToken {
    function decimals() external view returns (uint8);
}

contract PriceOracle is Ownable2Step, IPriceOracle {
    address public baseToken;

    address public swapRouter;

    address public factory;

    bool public constant isPriceOracle = true;

    constructor(address _baseToken, address _swapRouter) {
        baseToken = _baseToken;
        swapRouter = _swapRouter;
        factory = IUniswapV2Router02(swapRouter).factory();
        _transferOwnership(msg.sender);
    }

    function updateBaseToken(address _baseToken) external onlyOwner {
        require(_baseToken != address(0), "invalid baseToken address");
        baseToken = _baseToken;
    }

    function getTokenPrice(address _token) external view returns (uint256) {
        return _getTokenPrice(_token);
    }

    function getUnderlyingPrice(
        address _token
    ) external view returns (uint256) {
        address underlyingToken = ISFProtocolToken(_token).underlyingToken();
        return _getTokenPrice(underlyingToken);
    }

    function _getTokenPrice(address _token) internal view returns (uint256) {
        uint8 baseDecimal = IToken(baseToken).decimals();
        uint8 tokenDecimal = IToken(_token).decimals();

        address[] memory path = new address[](2);
        path[0] = _token;
        path[1] = baseToken;
        uint256[] memory amounts = IUniswapV2Router02(swapRouter).getAmountsOut(
            10 ** tokenDecimal,
            path
        );

        uint256 price = amounts[amounts.length - 1];
        return _scaleTo(price, baseDecimal, 18);
    }

    function _scaleTo(
        uint256 _amount,
        uint8 _fromDecimal,
        uint8 _toDecimal
    ) internal pure returns (uint256) {
        if (_fromDecimal < _toDecimal) {
            return _amount * 10 ** (_toDecimal - _fromDecimal);
        } else {
            return _amount / (10 ** (_fromDecimal - _toDecimal));
        }
    }
}
