// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.17;

interface IPriceOracle {
    function isPriceOracle() external view returns (bool);

    function getUnderlyingPrice(address _token) external view returns (uint256);
}
