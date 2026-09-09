// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MeraPortfolio, IAccount, IBook, IERC20Decimals, IMeraSwap} from "./MeraPortfolio.sol";

/// @notice Testnet workshop permission adapter. Custody stays in AccountCore.
contract MeraPortfolioV2 is EIP712, ReentrancyGuard {
    IAccount public immutable core;
    address public immutable implementation;
    MeraPortfolio public immutable legacy;
    address public immutable originalPolicy;
    address public immutable quoteToken;
    mapping(uint40 => uint256) public ownerNonces;
    struct OwnerAction { uint40 accountId; uint8 action; address signer; bytes32 configHash; uint256 nonce; uint256 authNonce; uint64 deadline; }
    bytes32 public constant OWNER_ACTION_TYPEHASH = keccak256("OwnerAction(uint40 accountId,uint8 action,address signer,bytes32 configHash,uint256 nonce,uint256 authNonce,uint64 deadline)");
    mapping(uint40 => address) public signerForAccount;
    event MeraConfigured(uint40 indexed accountId, address indexed signer);
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

    constructor(address accountCore_, address quote_, address[3] memory markets_, address legacy_) EIP712("KuruPortfolioPolicy", "1") {
        implementation = address(this); legacy = MeraPortfolio(legacy_); originalPolicy = address(legacy.legacy());
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
        if (address(this) != implementation) revert Unauthorized();
        address account = core.userAddressById(id);
        if (account == address(0) || core.getAccountOwner(account) != msg.sender || core.getAccountSubaccountSeq(account) != 0) revert Unauthorized();
    }
    function configureMeraPolicy(uint40 id, Config calldata c, address signer) external nonReentrant {
        _owner(id); _configure(id,c,signer);
    }
    function _configure(uint40 id, Config calldata c, address signer) internal {
        if (address(this) != implementation || signer == address(0) || signer == implementation) revert Unauthorized();
        bytes memory code = signer.code;
        if (keccak256(code) != keccak256(abi.encodePacked(hex"ef0100", implementation))) revert InvalidConfig();
        signerForAccount[id] = signer;
        emit MeraConfigured(id, signer);
        if (c.manager == address(0) || c.expiry <= block.timestamp || c.expiry > block.timestamp + 30 minutes || c.tradeCap == 0) revert InvalidConfig();
        for (uint256 i; i < 3; ++i) if (c.references[i] == 0 || c.floors[i] == 0 || c.floors[i] > c.references[i] || c.references[i] > c.ceilings[i]) revert InvalidConfig();
        _rollDay(id, c.references);
        policies[id].config = c;
        policies[id].paused = false;
        ++policies[id].version; ++ownerNonces[id];
        emit PolicyConfigured(id, policies[id].version, c.manager, c.expiry);
    }
    function pausePolicy(uint40 id) external nonReentrant {
        _owner(id); _pause(id);
    }
    function _pause(uint40 id) internal {
        policies[id].paused = true; ++policies[id].version; ++ownerNonces[id];
        emit PolicyPaused(id, policies[id].version);
    }
    function hashOwnerAction(OwnerAction calldata a) public view returns(bytes32) {
        bytes32 d=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("KuruPortfolioOwner"),keccak256("1"),block.chainid,implementation));
        return keccak256(abi.encodePacked(hex"1901",d,keccak256(abi.encode(OWNER_ACTION_TYPEHASH,a.accountId,a.action,a.signer,a.configHash,a.nonce,a.authNonce,a.deadline))));
    }
    function executeOwnerAction(OwnerAction calldata a, Config calldata c, bytes calldata signature) external nonReentrant {
        if(address(this)!=implementation || a.deadline<block.timestamp || a.deadline>block.timestamp+5 minutes || a.nonce!=ownerNonces[a.accountId]) revert Unauthorized();
        address account=core.userAddressById(a.accountId);
        if(account==address(0) || core.getAccountSubaccountSeq(account)!=0 || a.authNonce!=core.accountSignerAuthorizationNonces(account)) revert Unauthorized();
        if(a.configHash!=keccak256(abi.encode(c)) || !SignatureChecker.isValidSignatureNow(core.getAccountOwner(account),hashOwnerAction(a),signature)) revert Unauthorized();
        if(a.action==0) _configure(a.accountId,c,a.signer);
        else if(a.action==1 && a.signer==signerForAccount[a.accountId]) _pause(a.accountId);
        else revert InvalidPlan();
    }
    function getPolicy(uint40 id) external view returns (Policy memory) { return policies[id]; }
    function getUsage(uint40 id) external view returns (Usage memory u) {
        u = usages[id];
        if (u.day != block.timestamp / 1 days) u = Usage(uint64(block.timestamp / 1 days), 0, 0, policies[id].config.references);
        MeraPortfolio.Usage memory old = legacy.getUsage(id);
        u.bought += old.bought; u.sold += old.sold;
    }
    function _rollDay(uint40 id, uint128[3] memory refs) internal {
        uint64 today = uint64(block.timestamp / 1 days);
        if (usages[id].day != today || usages[id].references[0] == 0) {
            MeraPortfolio.Usage memory old = legacy.getUsage(id);
            if (usages[id].references[0] == 0 && old.references[0] != 0) refs = old.references;
            usages[id] = Usage(today, 0, 0, refs);
        }
    }
    function hashPlan(Plan calldata p) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](p.trades.length);
        for (uint256 i; i < hashes.length; ++i) {
            Trade calldata t = p.trades[i];
            hashes[i] = keccak256(abi.encode(TRADE_TYPEHASH, t.marketIndex, t.isBuy, t.amountIn, t.minAmountOut));
        }
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("KuruPortfolioPolicy"), keccak256("2"), block.chainid, signerForAccount[p.accountId]));
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(PLAN_TYPEHASH, p.accountId, p.version, p.authNonce, p.nonce, p.deadline, keccak256(abi.encodePacked(hashes))))));
    }
    /// @notice Entry point called at the delegated EOA. The implementation stores policy and usage.
    function executeRebalance(Plan calldata p, bytes calldata signature) external {
        if (address(this) == implementation) revert Unauthorized();
        MeraPortfolioV2(implementation).executeFor(p, signature);
    }
    /// @notice Only the configured Mera EOA can enter; the manager signature is checked below.
    function executeFor(Plan calldata p, bytes calldata signature) external nonReentrant {
        if (address(this) != implementation || signerForAccount[p.accountId] != msg.sender) revert Unauthorized();
        Policy storage policy = policies[p.accountId]; Config memory c = policy.config;
        if (policy.paused || c.expiry <= block.timestamp || p.deadline < block.timestamp || p.deadline > c.expiry) revert Inactive();
        if (p.version != policy.version || p.nonce != nonces[p.accountId] || p.trades.length == 0 || p.trades.length > 3) revert InvalidPlan();
        address account = core.userAddressById(p.accountId);
        if (p.authNonce != core.accountSignerAuthorizationNonces(account) || !core.isAuthorizedAccountSignerById(p.accountId,msg.sender,1)) revert Unauthorized();
        // Concurrent legacy authorization would allow two independent managers and two valuations.
        if (core.isAuthorizedAccountSignerById(p.accountId,originalPolicy,1)) revert Unauthorized();
        address priorSigner=legacy.signerForAccount(p.accountId);
        if(priorSigner!=address(0) && priorSigner!=msg.sender && core.isAuthorizedAccountSignerById(p.accountId,priorSigner,1)) revert Unauthorized();
        bytes32 digest = hashPlan(p);
        if (ECDSA.recover(digest,signature) != c.manager) revert Unauthorized();
        ++nonces[p.accountId]; _rollDay(p.accountId,c.references);
        Usage storage u = usages[p.accountId]; MeraPortfolio.Usage memory old = legacy.getUsage(p.accountId); uint256 seen; bool bought;
        for (uint256 i; i < p.trades.length; ++i) {
            Trade calldata t = p.trades[i]; uint256 m = t.marketIndex;
            if (m >= 3 || seen & (1 << m) != 0 || t.amountIn == 0 || t.minAmountOut == 0 || (bought && !t.isBuy)) revert InvalidPlan();
            seen |= 1 << m; bought = bought || t.isBuy;
            IBook.SwapResult memory r = IMeraSwap(msg.sender).swapLeg(p.accountId,uint8(m),t.isBuy,t.amountIn,t.minAmountOut,p.deadline);
            if (r.amountInUsed == 0 || r.amountOut == 0) revert EmptyFill();
            if (r.amountInUsed > t.amountIn || r.amountOut < t.minAmountOut) revert InvalidPlan();
            uint256 base = t.isBuy ? r.amountOut : r.amountInUsed;
            uint256 quote = t.isBuy ? r.amountInUsed : r.amountOut;
            // Rounded bounds avoid overflow and never accept an out-of-band average.
            if (quote < Math.mulDiv(base,c.floors[m],baseUnits[m],Math.Rounding.Ceil) || quote > Math.mulDiv(base,c.ceilings[m],baseUnits[m])) revert PriceOutsideBand();
            uint256 charge = t.isBuy ? quote : Math.mulDiv(base,u.references[m],baseUnits[m],Math.Rounding.Ceil);
            if (charge > c.tradeCap) revert BudgetExceeded();
            if (t.isBuy) {
                if (uint256(u.bought) + old.bought + charge > c.buyCap) revert BudgetExceeded();
                u.bought += uint128(charge);
            } else {
                if (uint256(u.sold) + old.sold + charge > c.sellCap) revert BudgetExceeded();
                u.sold += uint128(charge);
            }
            emit TradeExecuted(p.accountId,p.nonce,t.marketIndex,t.isBuy,r.amountInUsed,r.amountOut,uint128(charge));
        }
        emit RebalanceExecuted(p.accountId,p.nonce,digest);
    }
    /// @notice Typed callback from the policy implementation; Kuru observes this EOA as caller.
    function swapLeg(uint40 id, uint8 market, bool buy, uint128 amount, uint128 minimum, uint64 deadline) external returns (IBook.SwapResult memory) {
        if (address(this) == implementation || msg.sender != implementation || market >= 3) revert Unauthorized();
        return IBook(MeraPortfolioV2(implementation).markets(market)).swap(id,buy,amount,minimum,deadline);
    }
}
