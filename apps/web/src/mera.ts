import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { getAddress, type Address, type Hex, type LocalAccount, type TypedData } from "viem";


let storageSlot = "kuru-baskets.mera.v1";
const ETHEREUM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

let signingSession: Secp256k1SigningSession | undefined;
let viemAccount: LocalAccount<"mera"> | undefined;

function loadCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(storageSlot);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { credentialId?: unknown; transports?: unknown };
    if (typeof parsed.credentialId !== "string" || !parsed.credentialId) return undefined;
    if (parsed.transports !== undefined && (!Array.isArray(parsed.transports) || !parsed.transports.every((item) => typeof item === "string"))) return undefined;
    return { credentialId: parsed.credentialId, transports: parsed.transports as readonly string[] | undefined };
  } catch {
    return undefined;
  }
}

function storeCredential(credential: PasskeyCredentialMetadata) {
  localStorage.setItem(storageSlot, JSON.stringify(credential));
}

async function unlockPrfOutput() {
  const rpId = location.hostname;
  if (!rpId) throw new Error("Mera requires a hostname-bound WebAuthn relying party.");
  const known = loadCredential();
  if (known) {
    const unlocked = await getPasskeyPrfOutput({ rpId, credential: known });
    if (unlocked.credentialId !== known.credentialId) throw new Error("Mera returned a different passkey than the stored credential.");
    return unlocked.prfOutput;
  }
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "Kuru Baskets" },
    user: { name: "kuru-baskets", displayName: "Kuru Baskets trading signer" },
  });
  storeCredential({ credentialId: created.credentialId, transports: created.transports });
  return created.prfOutput;
}

export function endMeraSession() {
  signingSession?.end();
  signingSession = undefined;
  viemAccount = undefined;
}

async function createOrRestorePasskeyWallet(): Promise<Address> {
  endMeraSession();
  const prfOutput = await unlockPrfOutput();
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  prfOutput.fill(0);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(ETHEREUM_ACCOUNT_PATH);
  seed.fill(0);
  const privateKey = node.privateKey;
  if (privateKey === null) throw new Error("Mera account derivation produced no private key.");
  try {
    signingSession = createSecp256k1SigningSession({ privateKey });
    viemAccount = toViemAccount(signingSession);
    return getAddress(viemAccount.address);
  } finally {
    privateKey.fill(0);
  }
}

function requireAccount(): LocalAccount<"mera"> {
  if (!viemAccount) throw new Error("Unlock the Mera passkey before signing.");
  return viemAccount;
}

export async function unlockMera(owner:Address){
 storageSlot='kuru-baskets.mera.v1:'+owner.toLowerCase();
 await createOrRestorePasskeyWallet();return requireAccount();
}
window.addEventListener('pagehide',endMeraSession);
