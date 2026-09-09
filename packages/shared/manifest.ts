import { defineChain, parseAbi, type Address } from 'viem';
export const chain = defineChain({ id:10143,name:'Monad Testnet',nativeCurrency:{name:'Monad',symbol:'MON',decimals:18},rpcUrls:{default:{http:['https://testnet-rpc.monad.xyz']}},blockExplorers:{default:{name:'Monadscan',url:'https://testnet.monadscan.com'}},testnet:true });
export const deployment = {
  schemaVersion:1, docs:'https://kuru-testnet-docs.mintlify.site/deployments/testnet', sdk:'0.0.1',
  sdkCommit:'3237f743363d2296460d151a333b287d74cff603', contractCommit:'d214ffb24a8f31165b494f8577173a49f63f79f3',
  core:'0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22' as Address,
  coreImplementation:'0x5cEe690fCAa8b6f61759697C8E2B033bb15bF8C8' as Address,
  bookImplementation:'0xE20f57e673d7F254279c19270862A3d1E6F5B0d4' as Address,
  faucet:'0x25B1416FcD3400bE2D8F50bbe7Cf1101b8B891E9' as Address,
  usdc:'0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E' as Address,
  markets:[
    {symbol:'XAUt0',label:'Gold',address:'0x0B4dD2A7b09d5c5401149fFe51301Cc589017343',token:'0xee1Dce135a9aB598bca8CF3a28bDEF6892100740',decimals:6,multiplier:'1',pricePrecision:100},
    {symbol:'WETH',label:'Ethereum',address:'0xa9C2936656a7D2143720BcD91Ba8506200B7CbE7',token:'0x8B6C5fafeF85B030bB1e71ae7ac085cC2380aAf8',decimals:18,multiplier:'100000000',pricePrecision:100},
    {symbol:'cbBTC',label:'Bitcoin',address:'0x5BDEA6F9F9abA34F4EcB9B865646A792b835ef7f',token:'0xef2a20a161ac9ed1117d721336226b6399F15b4D',decimals:8,multiplier:'1',pricePrecision:100},
  ] as const,
};
export const coreAbi=parseAbi([
 'function depositForAccount(address account,address token,uint256 amount) payable',
 'function authorizeAccountSignerBySig(address account,address authorizer,address signer,uint32 permissions,uint64 expiry,uint256 nonce,uint256 deadline,bytes signature)',
 'function revokeAccountSignerBySig(address account,address authorizer,address signer,uint256 nonce,uint256 deadline,bytes signature)',
 'function deposit(address token,uint256 amount) payable','function withdraw(address token,uint256 amount)',
 'function userRegistry(address) view returns(uint40)','function userAddressById(uint40) view returns(address)',
 'function getAccountOwner(address) view returns(address)','function getAccountSubaccountSeq(address) view returns(uint16)',
 'function getBalance(address,address) view returns(uint256)',
 'function authorizeAccountSigner(address account,address signer,uint32 permissions,uint64 expiry)',
 'function revokeAccountSigner(address account,address signer)',
 'function isAuthorizedAccountSigner(address,address,uint32) view returns(bool)',
 'function accountSignerAuthorizationNonces(address) view returns(uint256)',
 'function verifiedSpotOrderBook(address) view returns(bool)',
]);
export const bookAbi=parseAbi([
 'function accountCore() view returns(address)','function baseToken() view returns(address)','function quoteToken() view returns(address)',
 'function baseSizeMultiplier() view returns(uint96)','function pricePrecision() view returns(uint32)',
 'function bestBidAsk() view returns(uint32 bid,uint32 ask)',
 'function getL2Book(uint256) view returns(uint32[] bidPrices,uint96[] bidSizes,uint32[] askPrices,uint96[] askSizes)',
 'function estimateSwap(uint40,bool,uint128) view returns((uint128 amountInUsed,uint128 amountOut))',
]);
export const faucetAbi=parseAbi(['function claim()','function nextClaimAt(address) view returns(uint256)']);
export const planTypes={Trade:[{name:'marketIndex',type:'uint8'},{name:'isBuy',type:'bool'},{name:'amountIn',type:'uint128'},{name:'minAmountOut',type:'uint128'}],Plan:[{name:'accountId',type:'uint40'},{name:'version',type:'uint256'},{name:'authNonce',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint64'},{name:'trades',type:'Trade[]'}]} as const;
export const domain=(policy:Address,version='1')=>({name:'KuruPortfolioPolicy',version,chainId:chain.id,verifyingContract:policy});
