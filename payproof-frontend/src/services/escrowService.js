import { request } from "./api.js";

// Routes of the backend EscrowController.
// Create comes from the spec. Confirm and lookup are still my guesses: copy the real
// paths from EscrowController into this table.
const ROUTES = {
  create: "/api/escrows",
  confirm: (escrowId) => `/api/escrows/${encodeURIComponent(escrowId)}/confirm`,
  byJob: (jobId) => `/api/escrows/job/${encodeURIComponent(jobId)}`,
};

export const NETWORK_ID = (import.meta.env.VITE_NEAR_NETWORK || "testnet").toLowerCase();
export const NETWORK_LABEL = NETWORK_ID === "mainnet" ? "NEAR Mainnet" : "NEAR Testnet";

export const explorerTxUrl = (hash) =>
  `https://${NETWORK_ID === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`;

/* ---------------- status helpers ---------------- */

const FUNDED_KEYS = [
  "funded",
  "worksubmitted",
  "disputed",
  "releasing",
  "refunding",
  "settlementfailed",
  "released",
  "refunded",
];

export const STATUS_LABELS = {
  awaitingfunding: { label: "Awaiting funding", tone: "amber" },
  funded: { label: "Funded", tone: "green" },
  worksubmitted: { label: "Work submitted", tone: "green" },
  disputed: { label: "Dispute raised", tone: "amber" },
  releasing: { label: "Payment release in progress", tone: "amber" },
  refunding: { label: "Refund in progress", tone: "amber" },
  settlementfailed: { label: "Settlement failed", tone: "red" },
  released: { label: "Payment released", tone: "green" },
  refunded: { label: "Refund completed", tone: "green" },
};

// "WorkSubmitted", "WORK_SUBMITTED" and "work submitted" all become "worksubmitted".
export const statusKey = (status) => String(status || "").toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- response helpers ---------------- */

function unwrap(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data.escrow ?? data.data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner;
  }
  return data;
}

export function normalizeEscrow(input) {
  const e = unwrap(input);
  if (!e || typeof e !== "object" || Array.isArray(e) || Object.keys(e).length === 0) return null;

  const rawStatus = e.status ?? e.escrowStatus ?? e.contractStatus ?? "";
  const key = statusKey(rawStatus);

  return {
    raw: e,
    escrowId: e.escrowId ?? e.id ?? null,
    jobId: e.jobId ?? null,
    status: String(rawStatus),
    statusKey: key,
    isFunded: FUNDED_KEYS.includes(key),
    amount: e.amount ?? e.budget ?? null,
    currency: e.currency ?? e.asset ?? null,
    freelancer: e.freelancer ?? e.freelancerWallet ?? e.freelancerAddress ?? null,
    txHash: e.transactionHash ?? e.txHash ?? e.fundingTransactionHash ?? null,
    platformFee: e.platformFee ?? e.feeAmount ?? null,
  };
}

/* ---------------- API calls ---------------- */

// Reserves the escrow and returns the transaction preparation details. Sends only the job ID.
export const createEscrow = (jobId) =>
  request(ROUTES.create, { method: "POST", body: { jobId } });

// Sends the transaction hash so the backend can verify it against NEAR.
export const confirmEscrow = ({ escrowId, jobId, transactionHash }) =>
  request(ROUTES.confirm(escrowId), {
    method: "POST",
    body: { escrowId, jobId, transactionHash, network: NETWORK_ID },
  });

// Resolves to the escrow for this job, or null when none exists yet.
export async function getEscrowForJob(jobId) {
  try {
    return normalizeEscrow(await request(ROUTES.byJob(jobId)));
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/* ---------------- pending transaction memory ----------------
   Remembers an in-flight funding (and the prepared transaction) so a page refresh or a
   cancelled wallet request never creates a second escrow. */

const savedKey = (jobId) => `payproof_escrow_tx_${jobId}`;

export function saveTx(jobId, data) {
  try {
    localStorage.setItem(savedKey(jobId), JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

export function readSavedTx(jobId) {
  try {
    const raw = localStorage.getItem(savedKey(jobId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSavedTx(jobId) {
  try {
    localStorage.removeItem(savedKey(jobId));
  } catch {
    /* storage unavailable */
  }
}