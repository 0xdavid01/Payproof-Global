import { request } from "./api.js";

// network: "TESTNET" | "MAINNET"
export const requestWalletChallenge = ({ walletAddress, network }) =>
  request("/api/auth/wallet/challenge", {
    method: "POST",
    body: { walletAddress, blockchain: "NEAR", network },
  });

export const verifyWalletSignature = ({ accountId, publicKey, signature, nonce, network }) =>
  request("/api/auth/wallet/verify", {
    method: "POST",
    body: { accountId, publicKey, signature, nonce, blockchain: "NEAR", network },
    // The backend also returns 401 for an invalid wallet signature; that is not a
    // PayProof session expiry and should be shown as a wallet verification error.
    suppressUnauthorizedEvent: true,
  });

// Resolves to the wallet object, or null when the backend answers 204 (no wallet linked).
export const getLinkedWallet = () => request("/api/auth/wallet");

export const revokeWallet = () => request("/api/auth/wallet/revoke", { method: "POST" });