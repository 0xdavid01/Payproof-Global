import { request } from "./api.js";

const base = (jobId) => `/api/escrows/jobs/${encodeURIComponent(jobId)}/dispute-proposal`;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const DECIMALS = { NEAR: 24, USDT: 6, USDC: 6 };

// Resolves to the proposal, or null when the backend answers 204 (no open proposal).
export const getDisputeProposal = (jobId) => request(base(jobId));

// action: "accept" | "reject" | "revoke". A 409 means the chain has not caught up yet,
// so it is retried twice, 2 seconds apart.
export async function confirmSplitAction(jobId, { action, transactionHash, reason }) {
  const body = action === "reject" ? { transactionHash, reason } : { transactionHash };

  for (let attempt = 0; ; attempt++) {
    try {
      return await request(`${base(jobId)}/${action}`, { method: "POST", body });
    } catch (err) {
      if (err.status === 409 && attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw err;
    }
  }
}

// Raw on-chain units (string) to a readable amount. Uses BigInt, never Number.
export function formatRaw(raw, asset, maxFrac = 6) {
  if (raw === null || raw === undefined || !/^\d+$/.test(String(raw))) return "—";
  const decimals = DECIMALS[String(asset).toUpperCase()] ?? 24;
  const padded = String(raw).padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).slice(0, maxFrac).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}