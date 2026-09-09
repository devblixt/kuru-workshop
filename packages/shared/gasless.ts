import {encodeAbiParameters,keccak256,parseAbiParameters,type Address} from 'viem';
import {z} from 'zod';
import {chain,deployment} from './manifest.ts';
export const uint=z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v=>BigInt(v)<2n**128n);
export const addressSchema=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const signatureSchema=z.string().regex(/^0x[0-9a-fA-F]+$/).max(4096);
const triple=z.tuple([uint,uint,uint]);
export const policyConfigSchema=z.object({manager:addressSchema,expiry:uint,buyCap:uint,sellCap:uint,tradeCap:uint,references:triple,floors:triple,ceilings:triple}).strict();
export const ownerActionSchema=z.object({accountId:z.number().int().positive().max(2**40-1),action:z.union([z.literal(0),z.literal(1)]),signer:addressSchema,configHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/),nonce:uint,authNonce:uint,deadline:uint}).strict();
const permissionSchema=z.object({signer:addressSchema,expiry:uint.optional(),nonce:uint,deadline:uint,signature:signatureSchema}).strict();
export const ownerRequestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('fund')}).strict(),
 z.object({kind:z.literal('policy'),action:ownerActionSchema,config:policyConfigSchema,signature:signatureSchema}).strict(),
 z.object({kind:z.literal('authorize'),permission:permissionSchema}).strict(),
 z.object({kind:z.literal('revoke'),permission:permissionSchema}).strict(),
 z.object({kind:z.literal('withdraw'),withdrawal:z.object({account:addressSchema,amount:uint,nonce:uint,authNonce:uint,expiry:uint,deadline:uint}).strict(),ownerSignature:signatureSchema,authorizeSignature:signatureSchema,revokeSignature:signatureSchema}).strict(),
]);
export type OwnerRequest=z.infer<typeof ownerRequestSchema>;
export const ownerTypes={OwnerAction:[{name:'accountId',type:'uint40'},{name:'action',type:'uint8'},{name:'signer',type:'address'},{name:'configHash',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'authNonce',type:'uint256'},{name:'deadline',type:'uint64'}]} as const;
export const authorizeTypes={AuthorizeAccountSigner:[{name:'account',type:'address'},{name:'authorizer',type:'address'},{name:'signer',type:'address'},{name:'permissions',type:'uint32'},{name:'expiry',type:'uint64'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
export const revokeTypes={RevokeAccountSigner:[{name:'account',type:'address'},{name:'authorizer',type:'address'},{name:'signer',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
export const withdrawalTypes={Withdrawal:[{name:'account',type:'address'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},{name:'authNonce',type:'uint256'},{name:'expiry',type:'uint64'},{name:'deadline',type:'uint256'}]} as const;
export const coreDomain={name:'KuruAccountCore',version:'1',chainId:chain.id,verifyingContract:deployment.core};
export const ownerDomain=(implementation:Address)=>({name:'KuruPortfolioOwner',version:'1',chainId:chain.id,verifyingContract:implementation});
export const withdrawalDomain=(router:Address)=>({name:'KuruWorkshopGasless',version:'1',chainId:chain.id,verifyingContract:router});
export function contractConfig(c:z.infer<typeof policyConfigSchema>){return {...c,manager:c.manager as Address,expiry:BigInt(c.expiry),buyCap:BigInt(c.buyCap),sellCap:BigInt(c.sellCap),tradeCap:BigInt(c.tradeCap),references:c.references.map(BigInt) as [bigint,bigint,bigint],floors:c.floors.map(BigInt) as [bigint,bigint,bigint],ceilings:c.ceilings.map(BigInt) as [bigint,bigint,bigint]};}
export function configHash(c:Omit<ReturnType<typeof contractConfig>,'references'|'floors'|'ceilings'> & {references:readonly [bigint,bigint,bigint],floors:readonly [bigint,bigint,bigint],ceilings:readonly [bigint,bigint,bigint]}){return keccak256(encodeAbiParameters(parseAbiParameters('(address manager,uint64 expiry,uint128 buyCap,uint128 sellCap,uint128 tradeCap,uint128[3] references,uint128[3] floors,uint128[3] ceilings)'),[c]));}
