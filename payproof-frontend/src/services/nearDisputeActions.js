const NETWORK_ID = (import.meta.env.VITE_NEAR_NETWORK || "testnet").toLowerCase();

const CONTRACT_ID =
  import.meta.env.VITE_ESCROW_CONTRACT_ID ||
  (NETWORK_ID === "mainnet" ? "payproof.near" : "payproof-escrowdavid.testnet");

const METHODS = {
  accept: "accept_dispute_split",
  reject: "reject_dispute_split",
  revoke: "revoke_dispute_acceptance",
};

// Signs one split action with the linked wallet and returns the transaction hash.
export async function signSplitAction(action, escrowId, reason, expectedAccountId) {
  const methodName = METHODS[action];

  if (!methodName) {
    throw new Error("Unknown dispute action.");
  }
  if (!escrowId || typeof escrowId !== "string") {
    throw new Error("This proposal does not have a valid escrow ID.");
  }
  if (action === "reject" && (!reason || reason.length > 500)) {
    throw new Error("Provide a reason of 1 to 500 characters.");
  }

  const near = await import("./nearWallet.js");
  await near.ensureWalletSessionMatches(expectedAccountId);

  const args = action === "reject" ? { escrow_id: escrowId, reason } : { escrow_id: escrowId };

  const outcome = await near.sendFunctionCall({
    receiverId: CONTRACT_ID,
    methodName,
    args,
    gas: "100000000000000",
    deposit: "1",
  });

  if (outcome?.status && typeof outcome.status === "object" && outcome.status.Failure) {
    throw new Error("The transaction failed on the NEAR blockchain.");
  }

  const hash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? null;

  if (!hash) {
    throw new Error(
      "The wallet did not return a transaction hash. Check your NEAR wallet activity before retrying."
    );
  }

  return hash;
}