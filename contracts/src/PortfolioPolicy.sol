// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IAccount {
    function userAddressById(uint40) external view returns (address);
    function getAccountOwner(address) external view returns (address);
    function getAccountSubaccountSeq(address) external view returns (uint16);
    function accountSignerAuthorizationNonces(address) external view returns (uint256);
    function isAuthorizedAccountSignerById(uint40,address,uint32) external view returns (bool);
    function verifiedSpotOrderBook(address) external view returns (bool);
}
interface IBook {
    struct SwapResult { uint128 amountInUsed; uint128 amountOut; }
    function accountCore() external view returns (address);
    function baseToken() external view returns (address);
    function quoteToken() external view returns (address);
    function swap(uint40,bool,uint128,uint128,uint64) external returns (SwapResult memory);
}
interface IERC20Decimals { function decimals() external view returns (uint8); }

/// @notice Testnet workshop permission adapter. Custody stays in AccountCore.
contract PortfolioPolicy is EIP712, ReentrancyGuard {
    IAccount public immutable core;
    address public immutable quoteToken;
    address[3] public markets;
    uint256[3] public baseUnits;
    struct Config {
        address manager; uint64 expiry;
        uint128 buyCap; uint128 sellCap; uint128 tradeCap;
        uint128[3] references; uint128[3] floors; uint128[3] ceilings;
    }
    struct Policy { Config config; uint256 version; bool paused; }
    struct Usage { uint64 day; uint128 bought; uint128 sold; uint128[3] references; }
    struct Trade { uint8 marketIndex; bool isBuy; uint128 amountIn; uint128 minAmountOut; }
    struct Plan { uint40 accountId; uint256 version; uint256 authNonce; uint256 nonce; uint64 deadline; Trade[] trades; }
    mapping(uint40 => Policy) private policies;
    mapping(uint40 => Usage) private usages;
    mapping(uint40 => uint256) public nonces;
    bytes32 public constant TRADE_TYPEHASH = keccak256("Trade(uint8 marketIndex,bool isBuy,uint128 amountIn,uint128 minAmountOut)");
    bytes32 public constant PLAN_TYPEHASH = keccak256("Plan(uint40 accountId,uint256 version,uint256 authNonce,uint256 nonce,uint64 deadline,Trade[] trades)Trade(uint8 marketIndex,bool isBuy,uint128 amountIn,uint128 minAmountOut)");
    error Unauthorized(); error InvalidConfig(); error InvalidPlan(); error Inactive();
    error BudgetExceeded(); error PriceOutsideBand(); error EmptyFill();
    event PolicyConfigured(uint40 indexed accountId, uint256 version, address manager, uint64 expiry);
    event PolicyPaused(uint40 indexed accountId, uint256 version);
    event TradeExecuted(uint40 indexed accountId, uint256 indexed nonce, uint8 marketIndex, bool isBuy, uint128 amountInUsed, uint128 amountOut, uint128 charged);
    event RebalanceExecuted(uint40 indexed accountId, uint256 indexed nonce, bytes32 digest);

    constructor(address accountCore_, address quote_, address[3] memory markets_) EIP712("KuruPortfolioPolicy", "1") {
        core = IAccount(accountCore_); quoteToken = quote_;
        if (IERC20Decimals(quote_).decimals() != 6) revert InvalidConfig();
        for (uint256 i; i < 3; ++i) {
            IBook b = IBook(markets_[i]);
            if (!core.verifiedSpotOrderBook(address(b)) || b.accountCore() != accountCore_ || b.quoteToken() != quote_) revert InvalidConfig();
            for (uint256 j; j < i; ++j) if (markets_[j] == markets_[i] || IBook(markets_[j]).baseToken() == b.baseToken()) revert InvalidConfig();
            uint8 decimals = IERC20Decimals(b.baseToken()).decimals();
            if (decimals > 18) revert InvalidConfig();
            markets[i] = markets_[i]; baseUnits[i] = 10 ** decimals;
        }
    }
    function _owner(uint40 id) internal view {
        address account = core.userAddressById(id);
        if (account == address(0) || core.getAccountOwner(account) != msg.sender || core.getAccountSubaccountSeq(account) != 0) revert Unauthorized();
    }
    function configurePolicy(uint40 id, Config calldata c) external nonReentrant {
        _owner(id);
        if (c.manager == address(0) || c.expiry <= block.timestamp || c.expiry > block.timestamp + 30 minutes || c.tradeCap == 0) revert InvalidConfig();
        for (uint256 i; i < 3; ++i) if (c.references[i] == 0 || c.floors[i] == 0 || c.floors[i] > c.references[i] || c.references[i] > c.ceilings[i]) revert InvalidConfig();
        _rollDay(id, c.references);
        policies[id].config = c;
        policies[id].paused = false;
        ++policies[id].version;
        emit PolicyConfigured(id, policies[id].version, c.manager, c.expiry);
    }
    function pausePolicy(uint40 id) external nonReentrant {
        _owner(id); policies[id].paused = true; ++policies[id].version;
        emit PolicyPaused(id, policies[id].version);
    }
    function getPolicy(uint40 id) external view returns (Policy memory) { return policies[id]; }
    function getUsage(uint40 id) external view returns (Usage memory u) {
        u = usages[id];
        if (u.day != block.timestamp / 1 days) u = Usage(uint64(block.timestamp / 1 days), 0, 0, policies[id].config.references);
    }
    function _rollDay(uint40 id, uint128[3] memory refs) internal {
        uint64 today = uint64(block.timestamp / 1 days);
        if (usages[id].day != today || usages[id].references[0] == 0) usages[id] = Usage(today, 0, 0, refs);
    }
    function hashPlan(Plan calldata p) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](p.trades.length);
        for (uint256 i; i < hashes.length; ++i) {
            Trade calldata t = p.trades[i];
            hashes[i] = keccak256(abi.encode(TRADE_TYPEHASH, t.marketIndex, t.isBuy, t.amountIn, t.minAmountOut));
        }
        return _hashTypedDataV4(keccak256(abi.encode(PLAN_TYPEHASH, p.accountId, p.version, p.authNonce, p.nonce, p.deadline, keccak256(abi.encodePacked(hashes)))));
    }
    function executeRebalance(Plan calldata p, bytes calldata signature) external nonReentrant {
        Policy storage policy = policies[p.accountId]; Config memory c = policy.config;
        if (policy.paused || c.expiry <= block.timestamp || p.deadline < block.timestamp || p.deadline > c.expiry) revert Inactive();
        if (p.version != policy.version || p.nonce != nonces[p.accountId] || p.trades.length == 0 || p.trades.length > 3) revert InvalidPlan();
        address account = core.userAddressById(p.accountId);
        if (p.authNonce != core.accountSignerAuthorizationNonces(account) || !core.isAuthorizedAccountSignerById(p.accountId,address(this),1)) revert Unauthorized();
        bytes32 digest = hashPlan(p);
        if (ECDSA.recover(digest,signature) != c.manager) revert Unauthorized();
        ++nonces[p.accountId]; _rollDay(p.accountId,c.references);
        Usage storage u = usages[p.accountId]; uint256 seen; bool bought;
        for (uint256 i; i < p.trades.length; ++i) {
            Trade calldata t = p.trades[i]; uint256 m = t.marketIndex;
            if (m >= 3 || seen & (1 << m) != 0 || t.amountIn == 0 || t.minAmountOut == 0 || (bought && !t.isBuy)) revert InvalidPlan();
            seen |= 1 << m; bought = bought || t.isBuy;
            IBook.SwapResult memory r = IBook(markets[m]).swap(p.accountId,t.isBuy,t.amountIn,t.minAmountOut,p.deadline);
            if (r.amountInUsed == 0 || r.amountOut == 0) revert EmptyFill();
            if (r.amountInUsed > t.amountIn || r.amountOut < t.minAmountOut) revert InvalidPlan();
            uint256 base = t.isBuy ? r.amountOut : r.amountInUsed;
            uint256 quote = t.isBuy ? r.amountInUsed : r.amountOut;
            // Rounded bounds avoid overflow and never accept an out-of-band average.
            if (quote < Math.mulDiv(base,c.floors[m],baseUnits[m],Math.Rounding.Ceil) || quote > Math.mulDiv(base,c.ceilings[m],baseUnits[m])) revert PriceOutsideBand();
            uint256 charge = t.isBuy ? quote : Math.mulDiv(base,u.references[m],baseUnits[m],Math.Rounding.Ceil);
            if (charge > c.tradeCap) revert BudgetExceeded();
            if (t.isBuy) {
                if (uint256(u.bought) + charge > c.buyCap) revert BudgetExceeded();
                u.bought += uint128(charge);
            } else {
                if (uint256(u.sold) + charge > c.sellCap) revert BudgetExceeded();
                u.sold += uint128(charge);
            }
            emit TradeExecuted(p.accountId,p.nonce,t.marketIndex,t.isBuy,r.amountInUsed,r.amountOut,uint128(charge));
        }
        emit RebalanceExecuted(p.accountId,p.nonce,digest);
    }
}
