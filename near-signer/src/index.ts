import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { connect, keyStores, KeyPair, Contract } from "near-api-js";

const PORT = Number(process.env.PORT ?? process.env.SIDECAR_PORT ?? 4100);
const RESOLVER_ACCOUNT = process.env.RESOLVER_ACCOUNT!;
const RESOLVER_KEY = process.env.NEAR_RESOLVER_PRIVATE_KEY!;
const CONTRACT_ID = process.env.CONTRACT_ID!;
const NETWORK_ID = process.env.NEAR_NETWORK ?? "testnet";
const RPC_URL = process.env.NEAR_RPC_URL ?? `https://rpc.${NETWORK_ID}.near.org`;
const SECRET = process.env.SIDECAR_SECRET!;

if (!RESOLVER_ACCOUNT || !RESOLVER_KEY || !CONTRACT_ID || !SECRET) {
  console.error(
    "Missing required env vars: RESOLVER_ACCOUNT, NEAR_RESOLVER_PRIVATE_KEY, CONTRACT_ID, SIDECAR_SECRET"
  );
  process.exit(1);
}

const keyStore = new keyStores.InMemoryKeyStore();
keyStore.setKey(
  NETWORK_ID,
  RESOLVER_ACCOUNT,
  KeyPair.fromString(RESOLVER_KEY as any)
);

async function getContract(): Promise<any> {
  const near = await connect({
    networkId: NETWORK_ID,
    keyStore,
    nodeUrl: RPC_URL,
  });
  const account = await near.account(RESOLVER_ACCOUNT);
  return new Contract(account, CONTRACT_ID, {
    viewMethods: [],
    changeMethods: [
      "propose_dispute_split",
      "cancel_dispute_split",
      "retry_split_settlement",
    ],
    useLocalViewExecution: false,
  });
}

const app = express();
app.use(express.json());

// Shared-secret guard on every request except /health
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health") return next();
  if (req.header("X-Sidecar-Secret") !== SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/proposeSplit", async (req, res) => {
  const { escrowId, freelancerAmountYocto, reason } = req.body ?? {};
  if (!escrowId || !freelancerAmountYocto || !reason) {
    return res
      .status(400)
      .json({ error: "escrowId, freelancerAmountYocto, reason required" });
  }
  try {
    const c = await getContract();
    const outcome = await c.propose_dispute_split(
      {
        escrow_id: escrowId,
        freelancer_amount: freelancerAmountYocto,
        reason,
      },
      "100000000000000",
      "1"
    );
    res.json({ txHash: outcome.transaction_outcome.id });
  } catch (e: any) {
    console.error("proposeSplit failed:", e);
    res.status(502).json({ error: e?.message ?? String(e) });
  }
});

app.post("/cancelSplit", async (req, res) => {
  const { escrowId, reason } = req.body ?? {};
  if (!escrowId || !reason) {
    return res.status(400).json({ error: "escrowId, reason required" });
  }
  try {
    const c = await getContract();
    const outcome = await c.cancel_dispute_split(
      { escrow_id: escrowId, reason },
      "100000000000000",
      "1"
    );
    res.json({ txHash: outcome.transaction_outcome.id });
  } catch (e: any) {
    console.error("cancelSplit failed:", e);
    res.status(502).json({ error: e?.message ?? String(e) });
  }
});

app.post("/retrySplit", async (req, res) => {
  const { escrowId } = req.body ?? {};
  if (!escrowId) {
    return res.status(400).json({ error: "escrowId required" });
  }
  try {
    const c = await getContract();
    const outcome = await c.retry_split_settlement(
      { escrow_id: escrowId },
      "100000000000000",
      "1"
    );
    res.json({ txHash: outcome.transaction_outcome.id });
  } catch (e: any) {
    console.error("retrySplit failed:", e);
    res.status(502).json({ error: e?.message ?? String(e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[near-signer] listening on 0.0.0.0:${PORT}, network=${NETWORK_ID}, resolver=${RESOLVER_ACCOUNT}, contract=${CONTRACT_ID}`
  );
});