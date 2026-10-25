// In-memory WebAuthn authenticator for scripts: P-256 keys held in Node, responses
// shaped like @simplewebauthn/browser's, so smart-account-kit can't tell the difference.
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";

export const RP_ID = "localhost";
export const ORIGIN = "http://localhost:5173";

const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** A minimal software authenticator holding P-256 keys in memory. */
export function softAuthenticator() {
  const keys = new Map<string, KeyObject>();
  // rpIdHash || flags (user present + user verified) || signCount
  const authData = Buffer.concat([sha256(RP_ID), Buffer.from([0x05]), Buffer.alloc(4)]);

  return {
    async startRegistration({ optionsJSON }: { optionsJSON: { challenge: string } }) {
      const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const id = b64url(Buffer.from(crypto.getRandomValues(new Uint8Array(16))));
      keys.set(id, privateKey);
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: "webauthn.create", challenge: optionsJSON.challenge, origin: ORIGIN }),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientDataJSON),
          attestationObject: "",
          publicKey: b64url(publicKey.export({ type: "spki", format: "der" })),
          publicKeyAlgorithm: -7,
          authenticatorData: b64url(authData),
          transports: ["internal"],
        },
      } as never;
    },
    async startAuthentication({
      optionsJSON,
    }: {
      optionsJSON: { challenge: string; allowCredentials?: { id: string }[] };
    }) {
      const id = optionsJSON.allowCredentials?.[0]?.id ?? [...keys.keys()][0];
      const key = keys.get(id);
      if (!key) throw new Error(`no credential ${id}`);
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge: optionsJSON.challenge,
          origin: ORIGIN,
          crossOrigin: false,
        }),
      );
      const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), key);
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(authData),
          signature: b64url(signature),
          userHandle: undefined,
        },
      } as never;
    },
  };
}


/** A SmartAccountKit wired to the soft authenticator and the local /relay. */
export function scriptKit(env: (k: string) => string, verifierUrl: string) {
  return new SmartAccountKit({
    rpcUrl: env("RPC_URL"),
    networkPassphrase: env("NETWORK_PASSPHRASE"),
    accountWasmHash: env("ACCOUNT_WASM_HASH"),
    webauthnVerifierAddress: env("WEBAUTHN_VERIFIER"),
    relayerUrl: `${verifierUrl}/relay`,
    storage: new MemoryStorage(),
    rpId: RP_ID,
    rpName: "ClipPay",
    allowedOrigins: [ORIGIN],
    webAuthn: softAuthenticator(),
  });
}
