// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {PortfolioPolicy as LegacyPolicy} from "../src/PortfolioPolicy.sol";
import {MeraPortfolio as PortfolioPolicy, IBook} from "../src/MeraPortfolio.sol";

contract MeraToken { uint8 public immutable decimals; constructor(uint8 d) { decimals = d; } }
contract MeraCore {
    address public legacy;
    function setLegacy(address a) external { legacy=a; }
    address public owner; uint256 public epoch; bool public allowed = true;
    constructor(address o) { owner=o; }
    function userAddressById(uint40 id) external view returns(address) { return id==1 ? owner : address(0); }
    function getAccountOwner(address a) external view returns(address) { return a==owner ? owner : address(0); }
    function getAccountSubaccountSeq(address) external pure returns(uint16) { return 0; }
    function accountSignerAuthorizationNonces(address) external view returns(uint256) { return epoch; }
    function isAuthorizedAccountSignerById(uint40 id,address signer,uint32) external view returns(bool) { return id==1 && allowed && signer!=legacy; }
    function verifiedSpotOrderBook(address) external pure returns(bool) { return true; }
    function revoke() external { allowed=false; ++epoch; }
    function reauthorize() external { allowed=true; ++epoch; }
}
contract MeraBook {
    address public accountCore; address public quoteToken; address public baseToken;
    address public lastCaller;
    uint128 public spent; uint128 public received; uint256 public calls;
    constructor(address c,address q,address b) { accountCore=c; quoteToken=q; baseToken=b; }
    function fill(uint128 a,uint128 b) external { spent=a; received=b; }
    function swap(uint40,bool,uint128,uint128,uint64) external returns(IBook.SwapResult memory) { lastCaller=msg.sender; ++calls; return IBook.SwapResult(spent,received); }
}
contract MeraPortfolioTest is Test {
    PortfolioPolicy p; MeraCore core; MeraBook[3] books;
    PortfolioPolicy delegated; LegacyPolicy legacy; address mera=address(0xBEEF); uint256 constant KEY=12345; address owner=address(0xCAFE);
    PortfolioPolicy.Config c;
    function setUp() public {
        vm.warp(10 days + 12 hours);
        core=new MeraCore(owner); address quote=address(new MeraToken(6)); address[3] memory markets;
        uint8[3] memory ds=[uint8(6),18,8];
        for(uint256 i;i<3;++i) { books[i]=new MeraBook(address(core),quote,address(new MeraToken(ds[i]))); markets[i]=address(books[i]); }
        legacy=new LegacyPolicy(address(core),quote,markets); core.setLegacy(address(legacy));
        p=new PortfolioPolicy(address(core),quote,markets,address(legacy));
        vm.etch(mera,abi.encodePacked(hex"ef0100",address(p))); delegated=PortfolioPolicy(mera);
        c.manager=vm.addr(KEY); c.expiry=uint64(block.timestamp+1800); c.buyCap=250e6; c.sellCap=250e6; c.tradeCap=100e6;
        c.references=[uint128(2e6),2e6,2e6]; c.floors=[uint128(1940000),1940000,1940000]; c.ceilings=[uint128(2060000),2060000,2060000];
        vm.prank(owner); p.configureMeraPolicy(1,c,mera);
    }
    function plan(uint8 market,bool buy,uint128 amount,uint128 out) internal view returns(PortfolioPolicy.Plan memory a) {
        a.accountId=1; a.version=p.getPolicy(1).version; a.authNonce=core.epoch(); a.nonce=p.nonces(1); a.deadline=uint64(block.timestamp+60);
        a.trades=new PortfolioPolicy.Trade[](1); a.trades[0]=PortfolioPolicy.Trade(market,buy,amount,out);
    }
    function sig(PortfolioPolicy.Plan memory a) internal view returns(bytes memory) { (uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,p.hashPlan(a)); return abi.encodePacked(r,s,v); }
    function buy(uint8 m,uint128 amount,uint128 out) internal { books[m].fill(amount,out); PortfolioPolicy.Plan memory a=plan(m,true,amount,out); delegated.executeRebalance(a,sig(a)); }
    function testFuzzActualBuyAccounting(uint64 amount) public {
        amount=uint64(bound(amount,1e6,100e6)); uint128 output=uint128(amount)/2;
        books[0].fill(amount,output);
        PortfolioPolicy.Plan memory a=plan(0,true,100e6,1);
        delegated.executeRebalance(a,sig(a)); assertEq(p.getUsage(1).bought,amount); assertEq(p.nonces(1),1);
    }
    function testDecimalsSellReferenceAccounting() public {
        uint128[3] memory bases=[uint128(25e6),25e18,25e8];
        for(uint8 i;i<3;++i) { books[i].fill(bases[i],50e6); PortfolioPolicy.Plan memory a=plan(i,false,bases[i],49e6); delegated.executeRebalance(a,sig(a)); }
        assertEq(p.getUsage(1).sold,150e6); assertEq(p.getUsage(1).bought,0);
    }
    function testFeeIncludedInBuyCharge() public { buy(1,10007000,5e18); assertEq(p.getUsage(1).bought,10007000); }
    function testDailyLimitAndRollback() public {
        buy(0,100e6,50e6); buy(0,100e6,50e6);
        books[0].fill(51e6,255e5); PortfolioPolicy.Plan memory a=plan(0,true,51e6,1); bytes memory s=sig(a);
        vm.expectRevert(PortfolioPolicy.BudgetExceeded.selector); delegated.executeRebalance(a,s);
        assertEq(p.getUsage(1).bought,200e6); assertEq(p.nonces(1),2); assertEq(books[0].calls(),2);
    }
    function testConfigAndPausePreserveUsageAndReferences() public {
        buy(0,100e6,50e6); vm.prank(owner); p.pausePolicy(1);
        c.references=[uint128(2010000),2010000,2010000]; vm.prank(owner); p.configureMeraPolicy(1,c,mera);
        assertEq(p.getUsage(1).bought,100e6); assertEq(p.getUsage(1).references[0],2e6);
    }
    function testRolloverDuringSession() public {
        vm.warp(11 days-900); c.expiry=uint64(block.timestamp+1800); vm.prank(owner); p.configureMeraPolicy(1,c,mera);
        buy(0,100e6,50e6); vm.warp(11 days+1); buy(0,100e6,50e6); assertEq(p.getUsage(1).bought,100e6);
    }
    function testReplayAndWrongManager() public {
        books[0].fill(10e6,5e6); PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory s=sig(a);
        delegated.executeRebalance(a,s); vm.expectRevert(PortfolioPolicy.InvalidPlan.selector); delegated.executeRebalance(a,s);
        a=plan(0,true,10e6,1); (uint8 v,bytes32 r,bytes32 ss)=vm.sign(42,p.hashPlan(a));
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); delegated.executeRebalance(a,abi.encodePacked(r,ss,v));
    }
    function testEpochInvalidAfterReauthorize() public {
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory s=sig(a); core.revoke(); core.reauthorize();
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); delegated.executeRebalance(a,s);
    }
    function testPriceRejectsBadExecution() public {
        books[0].fill(10e6,1e6); PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory s=sig(a);
        vm.expectRevert(PortfolioPolicy.PriceOutsideBand.selector); delegated.executeRebalance(a,s); assertEq(books[0].calls(),0);
    }
    function testZeroFillAndMinimumOutput() public {
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory s=sig(a);
        vm.expectRevert(PortfolioPolicy.EmptyFill.selector); delegated.executeRebalance(a,s);
        books[0].fill(10e6,5e6); a.trades[0].minAmountOut=6e6; s=sig(a);
        vm.expectRevert(PortfolioPolicy.InvalidPlan.selector); delegated.executeRebalance(a,s);
    }
    function testAtomicMultiLegRollback() public {
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); a.trades=new PortfolioPolicy.Trade[](2);
        a.trades[0]=PortfolioPolicy.Trade(0,true,10e6,1); a.trades[1]=PortfolioPolicy.Trade(1,true,10e6,1);
        books[0].fill(10e6,5e6); books[1].fill(10e6,1e18); bytes memory s=sig(a);
        vm.expectRevert(PortfolioPolicy.PriceOutsideBand.selector); delegated.executeRebalance(a,s);
        assertEq(books[0].calls(),0); assertEq(p.getUsage(1).bought,0); assertEq(p.nonces(1),0);
    }
    function testRejectDuplicateMarketAndSellAfterBuy() public {
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); a.trades=new PortfolioPolicy.Trade[](2);
        a.trades[0]=PortfolioPolicy.Trade(0,true,10e6,1); a.trades[1]=PortfolioPolicy.Trade(0,true,10e6,1); books[0].fill(10e6,5e6);
        bytes memory s=sig(a); vm.expectRevert(PortfolioPolicy.InvalidPlan.selector); delegated.executeRebalance(a,s);
        a.trades[1]=PortfolioPolicy.Trade(1,false,5e18,1); s=sig(a);
        vm.expectRevert(PortfolioPolicy.InvalidPlan.selector); delegated.executeRebalance(a,s);
    }
    function testUnauthorizedConfigAndExpiry() public {
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); p.configureMeraPolicy(1,c,mera);
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory s=sig(a); vm.warp(block.timestamp+1801);
        vm.expectRevert(PortfolioPolicy.Inactive.selector); delegated.executeRebalance(a,s);
    }

    function testSwapCallerIsMeraAndImplementationCannotExecute() public {
        buy(0,10e6,5e6); assertEq(books[0].lastCaller(),mera);
        PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory signature=sig(a);
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); p.executeRebalance(a,signature);
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); p.executeFor(a,signature);
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); delegated.swapLeg(1,0,true,10e6,1,a.deadline);
    }
    function testOnlyOwnerCanConfigureAndUndelegatedSignerRejected() public {
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector); p.configureMeraPolicy(1,c,mera);
        vm.prank(owner); vm.expectRevert(PortfolioPolicy.InvalidConfig.selector); p.configureMeraPolicy(1,c,address(123));
        vm.prank(owner); vm.expectRevert(PortfolioPolicy.Unauthorized.selector); delegated.configureMeraPolicy(1,c,mera);
    }
    function testRotationPreservesUsageAndInvalidatesOldWalletPlan() public {
        buy(0,100e6,50e6); PortfolioPolicy.Plan memory a=plan(0,true,10e6,1); bytes memory signature=sig(a);
        address replacement=address(0xBEEF2);vm.etch(replacement,abi.encodePacked(hex"ef0100",address(p)));
        vm.prank(owner);p.configureMeraPolicy(1,c,replacement);
        assertEq(p.getUsage(1).bought,100e6);assertEq(p.getUsage(1).references[0],2e6);
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector);delegated.executeRebalance(a,signature);
        vm.expectRevert(PortfolioPolicy.InvalidPlan.selector);PortfolioPolicy(replacement).executeRebalance(a,signature);
    }
    function testLegacyUsageIncludedAndConcurrentPermissionRejected() public {
        core.setLegacy(address(0));
        LegacyPolicy.Config memory lc=LegacyPolicy.Config(c.manager,c.expiry,c.buyCap,c.sellCap,c.tradeCap,c.references,c.floors,c.ceilings);
        vm.prank(owner);legacy.configurePolicy(1,lc);
        LegacyPolicy.Trade[] memory ts=new LegacyPolicy.Trade[](1);ts[0]=LegacyPolicy.Trade(0,true,100e6,1);
        LegacyPolicy.Plan memory a=LegacyPolicy.Plan(1,1,0,0,uint64(block.timestamp+60),ts);
        books[0].fill(100e6,50e6);(uint8 v,bytes32 r,bytes32 ss)=vm.sign(KEY,legacy.hashPlan(a));legacy.executeRebalance(a,abi.encodePacked(r,ss,v));
        assertEq(p.getUsage(1).bought,100e6);
        PortfolioPolicy.Plan memory next=plan(0,true,100e6,1);bytes memory signature=sig(next);
        vm.expectRevert(PortfolioPolicy.Unauthorized.selector);delegated.executeRebalance(next,signature);
        core.setLegacy(address(legacy));buy(0,100e6,50e6);assertEq(p.getUsage(1).bought,200e6);
        books[0].fill(60e6,30e6);next=plan(0,true,60e6,1);signature=sig(next);
        vm.expectRevert(PortfolioPolicy.BudgetExceeded.selector);delegated.executeRebalance(next,signature);
        vm.prank(owner);p.pausePolicy(1);vm.prank(owner);p.configureMeraPolicy(1,c,mera);assertEq(p.getUsage(1).bought,200e6);
        vm.warp(11 days);c.expiry=uint64(block.timestamp+1800);c.references=[uint128(2010000),2010000,2010000];
        vm.prank(owner);p.configureMeraPolicy(1,c,mera);assertEq(p.getUsage(1).bought,0);assertEq(p.getUsage(1).references[0],2010000);
    }
}
