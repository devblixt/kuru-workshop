import {createKuruClient,type KuruClientConfig} from '@toxicflow-labs/ts-sdk';
import {deployment} from '../../../packages/shared/manifest.ts';
// These three exercises are the participant exercise on the starter branch.
export function connectKuru(config:KuruClientConfig){return createKuruClient({...config,addresses:{accountCore:deployment.core}});}
export async function readAvailableBalance(client:ReturnType<typeof connectKuru>,user:`0x${string}`){return client.account.getBalance({user,token:deployment.usdc});}
export async function authorizeManager(client:ReturnType<typeof connectKuru>,account:`0x${string}`,policy:`0x${string}`,expiry:bigint){return client.account.authorizeAccountSigner({account,signer:policy,permissions:1,expiry});}

export async function readMarket(client:ReturnType<typeof connectKuru>){return client.spot.bestBidAsk({market:deployment.markets[1].address});}
