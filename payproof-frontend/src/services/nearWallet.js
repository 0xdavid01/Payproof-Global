import { Buffer } from "buffer";
import * as selectorCore from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";

import {
  requestWalletChallenge,
  verifyWalletSignature,
} from "./walletService.js";

const NETWORK_ID = (
  import.meta.env.VITE_NEAR_NETWORK || "testnet"
).toLowerCase();

const BACKEND_NETWORK =
  NETWORK_ID === "mainnet" ? "MAINNET" : "TESTNET";

const CONTRACT_ID =
  import.meta.env.VITE_ESCROW_CONTRACT_ID ||
  (NETWORK_ID === "mainnet"
    ? "payproof.near"
    : "payproof-escrowdavid.testnet");

const log = (...args) => {
  if (import.meta.env.DEV) {
    console.info("[PayProof Wallet]", ...args);
  }
};

let selectorPromise = null;
let modal = null;

function getSelector() {
  if (!selectorPromise) {
    selectorPromise = selectorCore
      .setupWalletSelector({
        network: NETWORK_ID,
        modules: [setupMeteorWallet()],
      })
      .then((selector) => {
        modal = setupModal(selector, {
          contractId: CONTRACT_ID,
        });

        log("Wallet selector initialized", {
          network: NETWORK_ID,
          contractId: CONTRACT_ID,
        });

        return selector;
      })
      .catch((error) => {
        selectorPromise = null;
        modal = null;
        throw error;
      });
  }

  return selectorPromise;
}

export function warmUpWallet() {
  return getSelector();
}

function activeAccountId(selector) {
  const accounts = selector.store.getState().accounts || [];
  const active = accounts.find((account) => account.active);

  return active?.accountId ?? null;
}

function promptSignIn(selector) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let signedInSub = null;
    let hideSub = null;

    const finish = (error) => {
      if (finished) return;

      finished = true;
      signedInSub?.remove?.();
      hideSub?.remove?.();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    signedInSub = selector.on("signedIn", () => {
      finish(null);
    });

    hideSub = modal?.on?.("onHide", () => {
      window.setTimeout(() => {
        if (!selector.isSignedIn()) {
          finish(new Error("Wallet connection was cancelled."));
        }
      }, 400);
    });

    modal.show();
  });
}

/* ---------------- signature helpers ---------------- */

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes) {
  if (!bytes.length) return "";

  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }

  const digits = [];

  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];

    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let result = "1".repeat(zeros);

  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

function normalizeSignature(signature) {
  if (signature && typeof signature !== "string") {
    return toBase58(Uint8Array.from(signature));
  }

  const raw = String(signature || "").replace(/^ed25519:/, "");

  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(raw)) {
    return raw;
  }

  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return toBase58(bytes);
}

/* ---------------- wallet connection ---------------- */

export async function connectAndLinkWallet(onStep = () => {}) {
  const stage = (name, details = {}) => {
    log(name, details);
    onStep(name, details);
  };

  stage("wallet-sign-in");

  const selector = await getSelector();

  if (!selector.isSignedIn()) {
    await promptSignIn(selector);
  }

  const accountId = activeAccountId(selector);

  if (!accountId) {
    throw new Error(
      "No active NEAR account was selected in your wallet."
    );
  }

  stage("challenge-request", {
    selectedAccount: accountId,
    network: BACKEND_NETWORK,
  });

  const challenge = await requestWalletChallenge({
    walletAddress: accountId,
    network: BACKEND_NETWORK,
  });

  if (
    !challenge?.message ||
    !challenge?.nonce ||
    !challenge?.recipient
  ) {
    throw new Error(
      "The backend returned an incomplete wallet challenge."
    );
  }

  const nonce = Buffer.from(challenge.nonce, "base64");

  if (nonce.length !== 32) {
    throw new Error(
      "The wallet challenge nonce must contain exactly 32 bytes."
    );
  }

  const wallet = await selector.wallet();

  if (typeof wallet.signMessage !== "function") {
    throw new Error(
      "Meteor Wallet does not expose the required NEP-413 signMessage method."
    );
  }

  stage("sign-request", {
    selectedAccount: accountId,
    recipient: challenge.recipient,
  });

  const signed = await wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce,
  });

  if (!signed?.signature || !signed?.publicKey) {
    throw new Error(
      "The wallet did not return a complete signature."
    );
  }

  const verifyAccount = signed.accountId || accountId;

  const result = await verifyWalletSignature({
    accountId: verifyAccount,
    publicKey: String(signed.publicKey),
    signature: normalizeSignature(signed.signature),
    nonce: challenge.nonce,
    network: BACKEND_NETWORK,
  });

  stage("verify-success", {
    linkedAccount: result?.walletAddress ?? verifyAccount,
  });

  return result;
}

/* ---------------- wallet session ---------------- */

export async function disconnectNearWallet() {
  try {
    const selector = await getSelector();

    if (selector.isSignedIn()) {
      const wallet = await selector.wallet();
      await wallet.signOut();
    }
  } catch (error) {
    log("Wallet sign-out failed", {
      message: error?.message,
    });
  }
}

export async function ensureWalletSession() {
  const selector = await getSelector();

  if (!selector.isSignedIn()) {
    throw new Error(
      "Your NEAR wallet is not connected. Connect it before approving this transaction."
    );
  }

  const accountId = activeAccountId(selector);

  if (!accountId) {
    throw new Error(
      "No active NEAR account was selected in your wallet."
    );
  }

  return accountId;
}

export async function ensureWalletSessionMatches(expectedAccountId) {
  if (!expectedAccountId) {
    throw new Error("Connect and link a NEAR wallet to continue.");
  }

  const accountId = await ensureWalletSession();
  if (accountId !== expectedAccountId) {
    throw new Error(
      `The connected NEAR account (${accountId}) does not match your linked PayProof wallet (${expectedAccountId}).`
    );
  }

  return accountId;
}

export async function switchWalletSessionTo(expectedAccountId) {
  if (!expectedAccountId) {
    throw new Error("Connect and link a NEAR wallet to continue.");
  }

  const selector = await getSelector();
  if (selector.isSignedIn()) {
    const wallet = await selector.wallet();
    await wallet.signOut();
  }

  await promptSignIn(selector);
  return ensureWalletSessionMatches(expectedAccountId);
}

export async function getWalletSessionAccount() {
  const selector = await getSelector();

  if (!selector.isSignedIn()) {
    return null;
  }

  return activeAccountId(selector);
}

export async function switchWalletAccount() {
  await disconnectNearWallet();
  return ensureWalletSession();
}

/* ---------------- transactions ---------------- */

export async function submitWorkOnChain(escrowId, evidence, expectedAccountId) {
  if (!escrowId || typeof escrowId !== "string") {
    throw new Error("This project does not have a valid escrow ID.");
  }

  if (typeof evidence !== "string" || !evidence.trim()) {
    throw new Error("Add a delivery link or description before submitting work.");
  }

  if (evidence.length > 10000) {
    throw new Error("The on-chain delivery evidence must be 10,000 characters or fewer.");
  }

  await ensureWalletSessionMatches(expectedAccountId);
  const outcome = await sendFunctionCall({
    receiverId: CONTRACT_ID,
    methodName: "submit_work",
    args: { escrow_id: escrowId, evidence: evidence.trim() },
    gas: "100000000000000",
    deposit: "0",
  });

  if (
    outcome?.status &&
    typeof outcome.status === "object" &&
    outcome.status.Failure
  ) {
    throw new Error("The submission transaction failed on the NEAR blockchain.");
  }

  return (
    outcome?.transaction?.hash ??
    outcome?.transaction_outcome?.id ??
    null
  );
}

export async function approveWorkOnChain(escrowId, expectedAccountId) {
  if (!escrowId || typeof escrowId !== "string") {
    throw new Error("This project does not have a valid escrow ID.");
  }

  await ensureWalletSessionMatches(expectedAccountId);
  const outcome = await sendFunctionCall({
    receiverId: CONTRACT_ID,
    methodName: "approve_work",
    args: { escrow_id: escrowId },
    gas: "100000000000000",
    deposit: "1",
  });

  if (
    outcome?.status &&
    typeof outcome.status === "object" &&
    outcome.status.Failure
  ) {
    throw new Error("The escrow approval transaction failed on the NEAR blockchain.");
  }

  return (
    outcome?.transaction?.hash ??
    outcome?.transaction_outcome?.id ??
    null
  );
}

async function submitEscrowCaseOnChain(methodName, escrowId, reason, expectedAccountId) {
  if (!escrowId || typeof escrowId !== "string") {
    throw new Error("This project does not have a valid escrow ID.");
  }
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
    throw new Error("Provide a reason of 1 to 500 characters.");
  }

  await ensureWalletSessionMatches(expectedAccountId);
  const outcome = await sendFunctionCall({
    receiverId: CONTRACT_ID,
    methodName,
    args: { escrow_id: escrowId, reason: reason.trim() },
    gas: "100000000000000",
    deposit: "1",
  });

  if (
    outcome?.status &&
    typeof outcome.status === "object" &&
    outcome.status.Failure
  ) {
    throw new Error("The dispute transaction failed on the NEAR blockchain.");
  }

  const transactionHash =
    outcome?.transaction?.hash ??
    outcome?.transaction_outcome?.id ??
    null;
  if (!transactionHash) {
    throw new Error(
      "The wallet did not return a transaction hash. Check your NEAR wallet activity before retrying."
    );
  }
  return transactionHash;
}

export const raiseDisputeOnChain = (escrowId, reason, expectedAccountId) =>
  submitEscrowCaseOnChain(
    "raise_dispute",
    escrowId,
    reason,
    expectedAccountId
  );

export const requestRefundOnChain = (escrowId, reason, expectedAccountId) =>
  submitEscrowCaseOnChain(
    "request_refund",
    escrowId,
    reason,
    expectedAccountId
  );

function buildFunctionCallAction({
  methodName,
  args,
  gas,
  deposit,
}) {
  const functionCall = selectorCore.actionCreators?.functionCall;

  if (typeof functionCall !== "function") {
    throw new Error(
      "The installed NEAR Wallet Selector package does not expose actionCreators.functionCall. Check that @near-wallet-selector/core is version 10.1.4."
    );
  }

  return functionCall(
    methodName,
    args,
    BigInt(gas),
    BigInt(deposit)
  );
}

export async function sendFunctionCall({
  receiverId,
  methodName,
  args,
  gas,
  deposit,
}) {
  if (!receiverId || !methodName) {
    throw new Error(
      "The transaction is missing its receiver or method name."
    );
  }

  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  ) {
    throw new Error("The transaction arguments are invalid.");
  }

  if (!/^\d+$/.test(String(gas)) || !/^\d+$/.test(String(deposit))) {
    throw new Error(
      "The transaction gas or deposit value is invalid."
    );
  }

  const selector = await getSelector();

  if (!selector.isSignedIn()) {
    throw new Error(
      "Your NEAR wallet is not connected. Connect your wallet and try again."
    );
  }

  const accountId = activeAccountId(selector);

  if (!accountId) {
    throw new Error(
      "No active NEAR account was selected in your wallet."
    );
  }

  const wallet = await selector.wallet();

  if (typeof wallet.signAndSendTransaction !== "function") {
    throw new Error(
      "The connected wallet does not support signAndSendTransaction."
    );
  }

  const action = buildFunctionCallAction({
    methodName,
    args,
    gas,
    deposit,
  });

  log("Starting wallet transaction", {
    accountId,
    receiverId,
    methodName,
    gas: String(gas),
    deposit: String(deposit),
    argumentKeys: Object.keys(args),
  });

  try {
    const result = await wallet.signAndSendTransaction({
      receiverId,
      actions: [action],
    });

    log("Wallet transaction returned", {
      hasResult: Boolean(result),
      transactionHash: result?.transaction?.hash ?? null,
      status: result?.status ?? null,
    });

    return result;
  } catch (error) {
    console.error(
      "[PayProof Wallet] Transaction signing failed:",
      error
    );

    throw error;
  }
}