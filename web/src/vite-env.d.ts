/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_CONTRACT_ID?: string;
  readonly VITE_TOKEN_ID?: string;
  readonly VITE_TOKEN_SYMBOL?: string;
  readonly VITE_VERIFIER_URL?: string;
  readonly VITE_ANCHOR_DOMAIN?: string;
}
