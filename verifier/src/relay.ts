// Fee-sponsoring relay for passkey smart wallets.
//
// Speaks the same `{ func, auth }` protocol as the OpenZeppelin Relayer
// (Channels) and smart-account-kit's RelayerClient: the wallet signs its auth
// entries, we wrap them in a transaction and pay the fee. Only ClipPay calls,
// withdrawals of the payout token, and smart-account deployments are accepted.
//
// With OZ_CHANNELS_API_KEY set, validated requests are forwarded to OZ Channels;
// otherwise SPONSOR_SECRET's account submits and pays.
import {
  Address,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { rateLimiter } from "./limits.ts";

export interface RelayConfig {
  rpcUrl: string;
  networkPassphrase: string;
  poolContractId: string;
  tokenId: string;
  accountWasmHash: string;
  deployer: string;
  sponsorSecret?: string;
  channelsUrl?: string;
  channelsApiKey?: string;
  /** Upper bound on the fee we'll pay for one transaction, in stroops. */
  maxFee: bigint;
  /** Sponsored transactions allowed per minute from one IP / for one wallet. */
  perIpPerMinute: number;
  perWalletPerMinute: number;
}

export type RelayResponse =
  | { success: true; data: { hash: string; status: string } }
  | { success: false; error: string };

export function createRelay(cfg: RelayConfig) {
  const server = new rpc.Server(cfg.rpcUrl);
  const sponsor = cfg.sponsorSecret ? Keypair.fromSecret(cfg.sponsorSecret) : null;
  if (!sponsor && !cfg.channelsApiKey) {
    throw new Error("relay needs SPONSOR_SECRET or OZ_CHANNELS_API_KEY");
  }

  /** Throws if the host function isn't something we're willing to pay for. */
  function check(func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[]) {
    for (const entry of auth) {
      // A source-account credential would let the caller spend as the sponsor.
      if (entry.credentials().switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
        throw new Error("only address-signed auth entries are accepted");
      }
    }

    switch (func.switch()) {
      case xdr.HostFunctionType.hostFunctionTypeInvokeContract(): {
        const call = func.invokeContract();
        const target = Address.fromScAddress(call.contractAddress()).toString();
        const fn = call.functionName().toString();
        if (target === cfg.poolContractId) return;
        if (target === cfg.tokenId && fn === "transfer") return;
        throw new Error(`calls to ${target}.${fn} are not sponsored`);
      }
      case xdr.HostFunctionType.hostFunctionTypeCreateContractV2(): {
        const args = func.createContractV2();
        const preimage = args.contractIdPreimage();
        if (preimage.switch() !== xdr.ContractIdPreimageType.contractIdPreimageFromAddress()) {
          throw new Error("unsupported deployment");
        }
        const deployer = Address.fromScAddress(preimage.fromAddress().address()).toString();
        const exec = args.executable();
        const hash =
          exec.switch() === xdr.ContractExecutableType.contractExecutableWasm()
            ? exec.wasmHash().toString("hex")
            : "";
        if (deployer !== cfg.deployer || hash !== cfg.accountWasmHash) {
          throw new Error("only smart-account deployments are sponsored");
        }
        return;
      }
      default:
        throw new Error("unsupported host function");
    }
  }

  async function viaSponsor(func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[]) {
    const source = await server.getAccount(sponsor!.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: cfg.networkPassphrase,
    })
      .addOperation(Operation.invokeHostFunction({ func, auth }))
      .setTimeout(60)
      .build();

    // Auth entries are already signed, so simulation runs them for real —
    // including each wallet's __check_auth — before we spend anything.
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error}`);
    if (BigInt(sim.minResourceFee) > cfg.maxFee) {
      throw new Error(`fee ${sim.minResourceFee} exceeds sponsor limit ${cfg.maxFee}`);
    }
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(sponsor!);

    const sent = await server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      throw new Error(`submission failed: ${sent.errorResult?.result().switch().name ?? "unknown"}`);
    }
    const done = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (done.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`transaction ${sent.hash} ${done.status.toLowerCase()}`);
    }
    return { hash: sent.hash, status: "confirmed" };
  }

  async function viaChannels(func: string, auth: string[]) {
    const res = await fetch(cfg.channelsUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.channelsApiKey}`,
      },
      body: JSON.stringify({ params: { func, auth } }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      data?: { hash?: string; status?: string };
    } | null;
    if (!body?.success || !body.data?.hash) {
      throw new Error(body?.error ?? `OZ Channels ${res.status}`);
    }
    return { hash: body.data.hash, status: body.data.status ?? "submitted" };
  }

  // Sponsor transactions share one sequence number stream, so send them one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const perIp = rateLimiter(cfg.perIpPerMinute);
  const perWallet = rateLimiter(cfg.perWalletPerMinute);

  /** The wallets whose signatures the request carries. */
  function signers(auth: xdr.SorobanAuthorizationEntry[]): string[] {
    return auth.map((e) => Address.fromScAddress(e.credentials().address().address()).toString());
  }

  return {
    mode: cfg.channelsApiKey ? "oz-channels" : "sponsor",
    sponsor: sponsor?.publicKey(),
    /** The sponsor's XLM balance in stroops, or null when OZ Channels pays. */
    async sponsorBalance(): Promise<bigint | null> {
      if (!sponsor) return null;
      const entry = await server.getAccountEntry(sponsor.publicKey());
      return BigInt(entry.balance().toString());
    },
    async handle(body: unknown, caller: { ip: string }): Promise<RelayResponse> {
      try {
        if (!perIp.take(caller.ip)) throw new Error("too many requests — try again in a minute");
        const { func, auth } = (body ?? {}) as { func?: unknown; auth?: unknown };
        if (typeof func !== "string" || !Array.isArray(auth) || auth.some((a) => typeof a !== "string")) {
          throw new Error("expected { func: string, auth: string[] }");
        }
        const hostFn = xdr.HostFunction.fromXDR(func, "base64");
        const entries = (auth as string[]).map((a) => xdr.SorobanAuthorizationEntry.fromXDR(a, "base64"));
        check(hostFn, entries);
        for (const wallet of signers(entries)) {
          if (!perWallet.take(wallet)) throw new Error("too many requests — try again in a minute");
        }

        const run = cfg.channelsApiKey
          ? () => viaChannels(func, auth as string[])
          : () => viaSponsor(hostFn, entries);
        const result = queue.then(run, run);
        queue = result.catch(() => {});
        return { success: true, data: await result };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
