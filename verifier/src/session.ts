// Sign-in with a Stellar wallet, for editing profiles and campaign details.
//
// The challenge is a Soroban authorization entry for a harmless call — the
// payout token's `approve(account, <challenge address>, 0, …)` — with a nonce
// derived from the challenge id. Any wallet that can sign auth entries can sign
// it: passkey smart accounts (their __check_auth runs) and classic accounts.
// We check the signature by simulating that call with auth enforced; it is
// never submitted. A valid signature earns an HMAC-signed session token.
import {
  Address,
  BASE_FEE,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

export interface SessionConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** SAC whose `approve` the challenge invokes. */
  tokenId: string;
  /** Any existing account; only used as the simulated transaction's source. */
  simulationSource: string;
  secret: string;
}

const CHALLENGE_TTL = 300; // seconds
const SESSION_TTL = 7 * 86_400;
const LEDGER_SLACK = 60; // ledgers a signature stays valid

const enc = new TextEncoder();
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

function isAccount(a: string) {
  return StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a);
}

export function createSessions(cfg: SessionConfig, db: D1Database) {
  const server = new rpc.Server(cfg.rpcUrl);
  const key = crypto.subtle.importKey("raw", enc.encode(cfg.secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

  /** The challenge's expected call; the challenge id fixes the spender and the nonce. */
  async function invocation(address: string, id: string, expiration: number) {
    const digest = await sha256(`clippay-sign-in:${id}`);
    const spender = StrKey.encodeContract(Buffer.from(digest));
    const args = new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(cfg.tokenId).toScAddress(),
      functionName: "approve",
      args: [
        nativeToScVal(address, { type: "address" }),
        nativeToScVal(spender, { type: "address" }),
        nativeToScVal(0n, { type: "i128" }),
        nativeToScVal(expiration, { type: "u32" }),
      ],
    });
    const nonce = new DataView(digest.buffer).getBigInt64(0);
    return { args, nonce };
  }

  async function challenge(address: string) {
    if (!isAccount(address)) throw new Error("not a Stellar account address");
    const id = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const latest = await server.getLatestLedger();
    const expiration = latest.sequence + LEDGER_SLACK;
    const { args, nonce } = await invocation(address, id, expiration);
    const entry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: Address.fromString(address).toScAddress(),
          nonce: xdr.Int64.fromString(nonce.toString()),
          signatureExpirationLedger: expiration,
          signature: xdr.ScVal.scvVoid(),
        }),
      ),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(args),
        subInvocations: [],
      }),
    });
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("DELETE FROM challenges WHERE expires < ?").bind(now).run();
    await db
      .prepare("INSERT INTO challenges (id, address, expires) VALUES (?, ?, ?)")
      .bind(id, address, now + CHALLENGE_TTL)
      .run();
    return { id, entry: entry.toXDR("base64"), expirationLedger: expiration };
  }

  /** Checks a signed challenge and returns a session token for its account. */
  async function verify(id: string, signedEntryXdr: string) {
    const now = Math.floor(Date.now() / 1000);
    const row = await db
      .prepare("DELETE FROM challenges WHERE id = ? AND expires >= ? RETURNING address")
      .bind(id, now)
      .first<{ address: string }>();
    if (!row) throw new Error("sign-in request expired — try again");

    const entry = xdr.SorobanAuthorizationEntry.fromXDR(signedEntryXdr, "base64");
    const creds = entry.credentials();
    if (creds.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
      throw new Error("unexpected sign-in signature");
    }
    const ac = creds.address();
    const signer = Address.fromScAddress(ac.address()).toString();
    const expiration = ac.signatureExpirationLedger();
    const expected = await invocation(row.address, id, expiration);
    const root = entry.rootInvocation();
    if (
      signer !== row.address ||
      BigInt(ac.nonce().toString()) !== expected.nonce ||
      root.subInvocations().length !== 0 ||
      root.function().toXDR("base64") !==
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(expected.args).toXDR("base64")
    ) {
      throw new Error("sign-in signature doesn't match the request");
    }

    // Simulate the call with this signature enforced: it only succeeds if the
    // account (classic signer or smart-account __check_auth) accepts it.
    const source = await server.getAccount(cfg.simulationSource);
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(expected.args),
          auth: [entry],
        }),
      )
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx, undefined, "enforce");
    if (rpc.Api.isSimulationError(sim)) throw new Error("the wallet signature couldn't be verified");

    return issue(row.address);
  }

  async function issue(address: string) {
    const payload = b64url(enc.encode(JSON.stringify({ a: address, e: Math.floor(Date.now() / 1000) + SESSION_TTL })));
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key, enc.encode(payload)));
    return { token: `${payload}.${b64url(sig)}`, address, expires: Math.floor(Date.now() / 1000) + SESSION_TTL };
  }

  /** The signed-in account from an `Authorization: Bearer …` header, or null. */
  async function account(req: Request): Promise<string | null> {
    const m = req.headers.get("Authorization")?.match(/^Bearer ([\w-]+)\.([\w-]+)$/);
    if (!m) return null;
    const ok = await crypto.subtle.verify("HMAC", await key, fromB64url(m[2]!), enc.encode(m[1]!));
    if (!ok) return null;
    try {
      const { a, e } = JSON.parse(new TextDecoder().decode(fromB64url(m[1]!))) as { a: string; e: number };
      return e > Date.now() / 1000 ? a : null;
    } catch {
      return null;
    }
  }

  return { challenge, verify, account };
}
