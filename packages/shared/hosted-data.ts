export type HostedMarket={symbol:string,marketAddress:string,bid:string,ask:string,reference:string,bidValue:string,askValue:string,available:boolean,feedEpoch:number,marketSeq:string};
export type HostedMarkets={source:'kuru-rest',fetchedAt:number,markets:HostedMarket[]};
export type HostedTrade={id:string,marketAddress:string,symbol:string,isBuy:boolean,isMaker:boolean,price:string,amount:string,decimals:number,at:number,block:string,hash:string,managerExecution?:boolean};
export type HostedTrades={source:'kuru-data-source',fetchedAt:number,feedEpoch:number|null,userSeq:string|null,hasMore:boolean,trades:HostedTrade[]};
