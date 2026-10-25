// Minimal anchor client for contract (C…) accounts: SEP-1 discovery, SEP-45 web
// auth, and SEP-24 interactive withdrawals. The wallet supplies `signEntry`, so a
// passkey smart account can authenticate without any secret key in this code.
import { Account, Address, MuxedAccount, StrKey, contract, xdr } from "@stellar/stellar-sdk";

export interface Anchor {
  homeDomain: string;
  networkPassphrase: string;
  signingKey: string;
  webAuthForContracts: string;
  webAuthContractId: string;
  transferServer: string;
}

/** SEP-1: read the fields we need from the anchor's stellar.toml. */
export async function loadAnchor(homeDomain: string): Promise<Anchor> {
  const res = await fetch(`https://${homeDomain}/.well-known/stellar.toml`);
  if (!res.ok) throw new Error(`stellar.toml: HTTP ${res.status}`);
  const toml: Record<string, string> = {};
  for (const line of (await res.text()).split("\n")) {
    if (line.trim().startsWith("[")) break; // top-level keys only
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"/);
    if (m) toml[m[1]] = m[2];
  }
  const need = (k: string) => {
    if (!toml[k]) throw new Error(`${homeDomain} does not publish ${k}`);
    return toml[k];
  };
  return {
    homeDomain,
    networkPassphrase: need("NETWORK_PASSPHRASE"),
    signingKey: need("SIGNING_KEY"),
    webAuthForContracts: need("WEB_AUTH_FOR_CONTRACTS_ENDPOINT"),
    webAuthContractId: need("WEB_AUTH_CONTRACT_ID"),
    transferServer: need("TRANSFER_SERVER_SEP0024"),
  };
}

export type SignEntry = (entry: xdr.SorobanAuthorizationEntry) => Promise<xdr.SorobanAuthorizationEntry>;

function entryAddress(e: xdr.SorobanAuthorizationEntry): string | null {
  const c = e.credentials();
  if (c.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) return null;
  return Address.fromScAddress(c.address().address()).toString();
}

function argsMap(e: xdr.SorobanAuthorizationEntry): Record<string, string> {
  const fn = e.rootInvocation().function().contractFn();
  const out: Record<string, string> = {};
  for (const entry of fn.args()[0]?.map() ?? []) {
    out[entry.key().sym().toString()] = entry.val().str().toString();
  }
  return out;
}

/**
 * SEP-45: authenticate a contract account and return the session JWT.
 * Checks the challenge the way the spec asks clients to before signing anything.
 */
export async function authenticate(anchor: Anchor, account: string, signEntry: SignEntry): Promise<string> {
  const url = new URL(anchor.webAuthForContracts);
  url.searchParams.set("account", account);
  url.searchParams.set("home_domain", anchor.homeDomain);
  const res = await fetch(url);
  const body = (await res.json()) as {
    authorization_entries?: string;
    authorizationEntries?: string; // Anchor Platform uses camelCase
    error?: string;
  };
  const challenge = body.authorization_entries ?? body.authorizationEntries;
  if (!res.ok || !challenge) throw new Error(body.error ?? `SEP-45 challenge: HTTP ${res.status}`);

  const entries = xdr.SorobanAuthorizationEntries.fromXDR(challenge, "base64");
  const webAuthDomain = new URL(anchor.webAuthForContracts).host;
  let nonce: string | undefined;
  for (const e of entries) {
    const inv = e.rootInvocation();
    const fn = inv.function().contractFn();
    const target = Address.fromScAddress(fn.contractAddress()).toString();
    const args = argsMap(e);
    nonce ??= args.nonce;
    if (
      inv.subInvocations().length > 0 ||
      target !== anchor.webAuthContractId ||
      fn.functionName().toString() !== "web_auth_verify" ||
      args.account !== account ||
      args.home_domain !== anchor.homeDomain ||
      args.web_auth_domain !== webAuthDomain ||
      args.web_auth_domain_account !== anchor.signingKey ||
      args.nonce !== nonce
    ) {
      throw new Error("SEP-45 challenge failed validation");
    }
  }
  if (!entries.some((e) => entryAddress(e) === anchor.signingKey)) {
    throw new Error("SEP-45 challenge is missing the anchor's signature");
  }

  const signed = await Promise.all(entries.map((e) => (entryAddress(e) === account ? signEntry(e) : e)));
  const signedXdr = encodeEntries(signed);
  const tokenRes = await fetch(anchor.webAuthForContracts, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorization_entries: signedXdr, authorizationEntries: signedXdr }),
  });
  const tokenBody = (await tokenRes.json()) as { token?: string; error?: string };
  if (!tokenRes.ok || !tokenBody.token) throw new Error(tokenBody.error ?? `SEP-45 token: HTTP ${tokenRes.status}`);
  return tokenBody.token;
}

/** XDR `SorobanAuthorizationEntries`: a uint32 count followed by each entry. */
function encodeEntries(entries: xdr.SorobanAuthorizationEntry[]): string {
  const parts = entries.map((e) => new Uint8Array(e.toXDR()));
  const out = new Uint8Array(4 + parts.reduce((n, p) => n + p.length, 0));
  new DataView(out.buffer).setUint32(0, entries.length);
  let offset = 4;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  let binary = "";
  for (const byte of out) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface Sep24Transaction {
  id: string;
  kind: string;
  status: string;
  status_eta?: number;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  amount_in_asset?: string;
  amount_out_asset?: string;
  fee_details?: { total: string; asset: string };
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: "text" | "id" | "hash";
  more_info_url?: string;
  stellar_transaction_id?: string;
  message?: string;
}

async function sep24<T>(anchor: Anchor, jwt: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${anchor.transferServer}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `SEP-24 ${path}: HTTP ${res.status}`);
  return body;
}

/** SEP-24: start an interactive withdrawal; open `url` for the user's bank details. */
export function startWithdraw(
  anchor: Anchor,
  jwt: string,
  req: { assetCode: string; account: string; amount?: string; lang?: string },
): Promise<{ id: string; url: string; type: string }> {
  return sep24(anchor, jwt, "/transactions/withdraw/interactive", {
    method: "POST",
    body: JSON.stringify({
      asset_code: req.assetCode,
      account: req.account,
      ...(req.amount ? { amount: req.amount } : {}),
      lang: req.lang ?? "en",
    }),
  });
}

export async function getTransaction(anchor: Anchor, jwt: string, id: string): Promise<Sep24Transaction> {
  const body = await sep24<{ transaction: Sep24Transaction }>(
    anchor,
    jwt,
    `/transaction?id=${encodeURIComponent(id)}`,
  );
  return body.transaction;
}

/**
 * Where to send the withdrawal. A contract account can't attach a transaction
 * memo, so an `id` memo is carried in a muxed (M…) destination instead — the
 * token transfer then emits it as `to_muxed_id` (CAP-67).
 */
export function paymentDestination(tx: Sep24Transaction): string {
  const to = tx.withdraw_anchor_account;
  if (!to) throw new Error("anchor has not provided a deposit account yet");
  if (!tx.withdraw_memo) return to;
  if (tx.withdraw_memo_type !== "id") {
    throw new Error(`a ${tx.withdraw_memo_type} memo can't be sent from a contract account`);
  }
  if (!StrKey.isValidEd25519PublicKey(to)) throw new Error(`can't mux ${to}`);
  return new MuxedAccount(new Account(to, "0"), tx.withdraw_memo).accountId();
}

interface Sac {
  transfer(args: { from: string; to: string; amount: bigint }): Promise<contract.AssembledTransaction<null>>;
}

/**
 * Build the token transfer that pays a withdrawal from a contract account. Goes
 * through the SAC directly because its `transfer` takes a MuxedAddress `to`;
 * the caller's wallet signs the auth entry (e.g. `kit.signAndSubmit(tx)`).
 */
export async function buildWithdrawalPayment(opts: {
  rpcUrl: string;
  networkPassphrase: string;
  tokenId: string;
  from: string;
  tx: Sep24Transaction;
  decimals?: number;
}): Promise<contract.AssembledTransaction<null>> {
  if (!opts.tx.amount_in) throw new Error("anchor has not confirmed the amount yet");
  const sac = (await contract.Client.from({
    contractId: opts.tokenId,
    rpcUrl: opts.rpcUrl,
    networkPassphrase: opts.networkPassphrase,
  })) as contract.Client & Sac;
  return sac.transfer({
    from: opts.from,
    to: paymentDestination(opts.tx),
    amount: toUnits(opts.tx.amount_in, opts.decimals ?? 7),
  });
}

function toUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}
