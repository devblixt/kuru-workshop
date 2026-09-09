import {createKuruClient,type KuruClientConfig} from '@toxicflow-labs/ts-sdk';
import {deployment} from '../../../packages/shared/manifest.ts';
// Exercise 1: create the SDK client with config and canonical AccountCore.
export function connectKuru(config:KuruClientConfig):ReturnType<typeof createKuruClient>{throw new Error('TODO 1: connect the Kuru SDK');}
// Exercise 2: read available USDC (raw six-decimal units), not the wallet balance.
export async function readAvailableBalance(client:ReturnType<typeof connectKuru>,user:`0x${string}`):Promise<bigint>{throw new Error('TODO 2: read the AccountCore balance');}
// Exercise 2b: read the ETH market best bid/ask; values are in market price ticks.
export async function readMarket(client:ReturnType<typeof connectKuru>):Promise<readonly [bigint,bigint]>{throw new Error('TODO 2b: read the ETH market');}
// Exercise 3: authorize only TRADE (1), for this account and expiry.
export async function authorizeManager(client:ReturnType<typeof connectKuru>,account:`0x${string}`,policy:`0x${string}`,expiry:bigint):Promise<`0x${string}`>{throw new Error('TODO 3: authorize the policy');}
