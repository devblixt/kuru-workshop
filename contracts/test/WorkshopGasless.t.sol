// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {WorkshopGasless} from "../src/WorkshopGasless.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
contract GrantToken is ERC20 {
 constructor() ERC20("Test USDC","USDC"){}
 function mint(address to,uint256 n) external {_mint(to,n);}
}
contract GrantCore is EIP712 {
 GrantToken public token;
 mapping(address=>uint256) public balances;
 mapping(address=>uint256) public nonces;
 mapping(address=>address) public signer;
 mapping(address=>uint64) public expiry;
 constructor(GrantToken t) EIP712("KuruAccountCore","1"){token=t;}
 function getAccountOwner(address a) external pure returns(address){return a;}
 function getAccountSubaccountSeq(address) external pure returns(uint16){return 0;}
 function depositForAccount(address a,address t,uint256 amount) external payable {require(t==address(token));token.transferFrom(msg.sender,address(this),amount);balances[a]+=amount;}
 function withdrawFromAccount(address a,address t,uint256 amount) external {require(t==address(token)&&signer[a]==msg.sender&&expiry[a]>block.timestamp);balances[a]-=amount;token.transfer(msg.sender,amount);}
 function authorizeAccountSignerBySig(address a,address authorizer,address s,uint32 p,uint64 e,uint256 n,uint256 d,bytes calldata sig) external {
  bytes32 h=keccak256(abi.encode(keccak256("AuthorizeAccountSigner(address account,address authorizer,address signer,uint32 permissions,uint64 expiry,uint256 nonce,uint256 deadline)"),a,authorizer,s,p,e,n,d));
  require(a==authorizer&&p==8&&n==nonces[a]&&d>=block.timestamp&&ECDSA.recover(_hashTypedDataV4(h),sig)==a);
  ++nonces[a];signer[a]=s;expiry[a]=e;
 }
 function revokeAccountSignerBySig(address a,address authorizer,address s,uint256 n,uint256 d,bytes calldata sig) external {
  bytes32 h=keccak256(abi.encode(keccak256("RevokeAccountSigner(address account,address authorizer,address signer,uint256 nonce,uint256 deadline)"),a,authorizer,s,n,d));
  require(a==authorizer&&n==nonces[a]&&d>=block.timestamp&&ECDSA.recover(_hashTypedDataV4(h),sig)==a);
  ++nonces[a];signer[a]=address(0);expiry[a]=0;
 }
 function digest(bytes32 h) external view returns(bytes32){return _hashTypedDataV4(h);}
}
contract WorkshopGaslessTest is Test {
 uint256 constant OWNER_KEY=789;address owner=vm.addr(OWNER_KEY);address relayer=address(0xCAFE);
 GrantToken token;GrantCore core;WorkshopGasless router;
 function setUp() public {vm.warp(10 days);token=new GrantToken();core=new GrantCore(token);router=new WorkshopGasless(address(core),address(token),relayer);token.mint(address(router),7500e6);}
 function fund() internal {vm.prank(relayer);router.fund(owner);}
 function sign(bytes32 h) internal view returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(OWNER_KEY,h);return abi.encodePacked(r,s,v);}
 function request() internal view returns(WorkshopGasless.Withdrawal memory w){w=WorkshopGasless.Withdrawal(owner,100e6,router.withdrawalNonces(owner),core.nonces(owner),uint64(block.timestamp+300),block.timestamp+300);}
 function signatures(WorkshopGasless.Withdrawal memory w) internal view returns(bytes memory a,bytes memory b,bytes memory c){
  a=sign(router.hashWithdrawal(w));
  b=sign(core.digest(keccak256(abi.encode(keccak256("AuthorizeAccountSigner(address account,address authorizer,address signer,uint32 permissions,uint64 expiry,uint256 nonce,uint256 deadline)"),owner,owner,address(router),uint32(8),w.expiry,w.authNonce,w.deadline))));
  c=sign(core.digest(keccak256(abi.encode(keccak256("RevokeAccountSigner(address account,address authorizer,address signer,uint256 nonce,uint256 deadline)"),owner,owner,address(router),w.authNonce+1,w.deadline))));
 }
 function testFundingCreditsAccountAndRespectsCooldown() public {
  vm.expectRevert(WorkshopGasless.Unauthorized.selector);router.fund(owner);
  fund();assertEq(core.balances(owner),250e6);assertEq(token.balanceOf(owner),0);assertEq(token.balanceOf(address(router)),7250e6);
  vm.prank(relayer);vm.expectRevert(WorkshopGasless.Cooldown.selector);router.fund(owner);
  vm.warp(block.timestamp+12 hours);fund();assertEq(core.balances(owner),500e6);
 }
 function testEmptyPoolRollsBackClaim() public {
  WorkshopGasless empty=new WorkshopGasless(address(core),address(token),relayer);
  vm.prank(relayer);vm.expectRevert();empty.fund(owner);assertEq(empty.nextClaimAt(owner),0);
 }
 function testWithdrawalIsOwnerBoundAndRevokesPermission() public {
  fund();WorkshopGasless.Withdrawal memory w=request();(bytes memory a,bytes memory b,bytes memory c)=signatures(w);
  router.withdraw(w,a,b,c);assertEq(token.balanceOf(owner),100e6);assertEq(core.balances(owner),150e6);assertEq(core.signer(owner),address(0));assertEq(core.nonces(owner),2);assertEq(router.withdrawalNonces(owner),1);assertEq(token.balanceOf(address(router)),7250e6);
  vm.expectRevert(WorkshopGasless.InvalidRequest.selector);router.withdraw(w,a,b,c);
 }
 function testFinalRevocationFailureRevertsEveryTransferAndNonce() public {
  fund();WorkshopGasless.Withdrawal memory w=request();(bytes memory a,bytes memory b,)=signatures(w);
  vm.expectRevert();router.withdraw(w,a,b,b);
  assertEq(token.balanceOf(owner),0);assertEq(core.balances(owner),250e6);assertEq(core.signer(owner),address(0));assertEq(core.nonces(owner),0);assertEq(router.withdrawalNonces(owner),0);
 }
 function testAmountTamperingAndExpiredSignaturesReject() public {
  fund();WorkshopGasless.Withdrawal memory w=request();(bytes memory a,bytes memory b,bytes memory c)=signatures(w);w.amount+=1;
  vm.expectRevert(WorkshopGasless.Unauthorized.selector);router.withdraw(w,a,b,c);w.amount-=1;vm.warp(block.timestamp+301);
  vm.expectRevert(WorkshopGasless.InvalidRequest.selector);router.withdraw(w,a,b,c);
 }
}
