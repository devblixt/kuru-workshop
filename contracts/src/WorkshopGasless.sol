// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
interface IGaslessCore {
    function depositForAccount(address,address,uint256) external payable;
    function withdrawFromAccount(address,address,uint256) external;
    function getAccountOwner(address) external view returns(address);
    function getAccountSubaccountSeq(address) external view returns(uint16);
    function authorizeAccountSignerBySig(address,address,address,uint32,uint64,uint256,uint256,bytes calldata) external;
    function revokeAccountSignerBySig(address,address,address,uint256,uint256,bytes calldata) external;
}
/// @notice Fixed workshop grants and owner-signed USDC withdrawals. No trading authority.
contract WorkshopGasless is EIP712,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IGaslessCore public immutable core;
    IERC20 public immutable usdc;
    address public immutable relayer;
    uint256 public constant GRANT = 250e6;
    mapping(address=>uint64) public nextClaimAt;
    mapping(address=>uint256) public withdrawalNonces;
    struct Withdrawal { address account; uint256 amount; uint256 nonce; uint256 authNonce; uint64 expiry; uint256 deadline; }
    bytes32 public constant WITHDRAWAL_TYPEHASH=keccak256("Withdrawal(address account,uint256 amount,uint256 nonce,uint256 authNonce,uint64 expiry,uint256 deadline)");
    error Unauthorized(); error InvalidRequest(); error Cooldown();
    event Funded(address indexed account,uint256 amount,uint64 nextClaim);
    event Withdrawn(address indexed account,uint256 amount,uint256 nonce);
    constructor(address core_,address usdc_,address relayer_) EIP712("KuruWorkshopGasless","1") {
        if(core_==address(0)||usdc_==address(0)||relayer_==address(0)) revert InvalidRequest();
        core=IGaslessCore(core_);usdc=IERC20(usdc_);relayer=relayer_;
    }
    function fund(address account) external nonReentrant {
        if(msg.sender!=relayer) revert Unauthorized();
        if(account==address(0)) revert InvalidRequest();
        if(block.timestamp<nextClaimAt[account]) revert Cooldown();
        nextClaimAt[account]=uint64(block.timestamp+12 hours);
        usdc.forceApprove(address(core),GRANT);
        core.depositForAccount(account,address(usdc),GRANT);
        emit Funded(account,GRANT,nextClaimAt[account]);
    }
    function hashWithdrawal(Withdrawal calldata w) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(WITHDRAWAL_TYPEHASH,w.account,w.amount,w.nonce,w.authNonce,w.expiry,w.deadline)));
    }
    /// @notice Authorize WITHDRAW temporarily, return USDC only to its owner, then revoke atomically.
    function withdraw(Withdrawal calldata w,bytes calldata ownerSignature,bytes calldata authorizeSignature,bytes calldata revokeSignature) external nonReentrant {
        if(w.amount==0||w.deadline<block.timestamp||w.deadline>block.timestamp+5 minutes||w.expiry<=block.timestamp||w.expiry>block.timestamp+5 minutes||w.nonce!=withdrawalNonces[w.account]) revert InvalidRequest();
        if(core.getAccountOwner(w.account)!=w.account||core.getAccountSubaccountSeq(w.account)!=0||!SignatureChecker.isValidSignatureNow(w.account,hashWithdrawal(w),ownerSignature)) revert Unauthorized();
        ++withdrawalNonces[w.account];
        core.authorizeAccountSignerBySig(w.account,w.account,address(this),8,w.expiry,w.authNonce,w.deadline,authorizeSignature);
        core.withdrawFromAccount(w.account,address(usdc),w.amount);
        usdc.safeTransfer(w.account,w.amount);
        core.revokeAccountSignerBySig(w.account,w.account,address(this),w.authNonce+1,w.deadline,revokeSignature);
        emit Withdrawn(w.account,w.amount,w.nonce);
    }
}
