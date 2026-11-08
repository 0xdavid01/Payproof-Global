const GAS_NEAR = "100000000000000";
const GAS_TOKEN = "200000000000000";
const PLATFORM_FEE_BPS = 350n;
const BASIS_POINTS = 10_000n;

const APP_NETWORK = (
  import.meta.env.VITE_NEAR_NETWORK || "testnet"
).toUpperCase();

const CONFIGURED_CONTRACT =
  import.meta.env.VITE_ESCROW_CONTRACT_ID || "";

const isPositiveInteger = (value) =>
  /^\d+$/.test(String(value ?? "")) &&
  BigInt(String(value)) > 0n;

const isNonNegativeInteger = (value) =>
  /^\d+$/.test(String(value ?? ""));

export class WalletTxError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "WalletTxError";
    this.kind = kind;
  }
}

export function normalizePreparation(input) {
  const top = input && typeof input === "object" ? input : {};
  const nested = top.preparation ?? top.transaction ?? top.data;

  const p = {
    ...top,
    ...(nested && typeof nested === "object" ? nested : {}),
  };

  let args = p.args ?? {};

  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      throw new WalletTxError(
        "failed",
        "The server returned invalid transaction arguments."
      );
    }
  }

  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  ) {
    throw new WalletTxError(
      "failed",
      "The server returned invalid transaction arguments."
    );
  }

  const methodName = p.methodName ?? p.method ?? null;
  let platformFee = p.platformFee ?? p.feeAmount ?? null;
  let attachedDeposit = p.attachedDeposit ?? p.deposit ?? null;

  if (
    methodName === "create_and_fund_with_near" &&
    isPositiveInteger(args.amount)
  ) {
    const projectAmount = BigInt(String(args.amount));
    const calculatedFee = (projectAmount * PLATFORM_FEE_BPS) / BASIS_POINTS;
    const calculatedDeposit = (projectAmount + calculatedFee).toString();

    if (
      platformFee != null &&
      String(platformFee) !== calculatedFee.toString()
    ) {
      console.warn(
        "[PayProof] Backend platform fee does not match the configured 3.5% fee; using the calculated fee.",
        { platformFee, calculatedPlatformFee: calculatedFee.toString() }
      );
    }

    if (
      attachedDeposit != null &&
      String(attachedDeposit) !== calculatedDeposit
    ) {
      console.warn(
        "[PayProof] Backend attached deposit does not include the full platform fee; using the calculated total.",
        { attachedDeposit, calculatedAttachedDeposit: calculatedDeposit }
      );
    }

    platformFee = calculatedFee.toString();
    attachedDeposit = calculatedDeposit;
  }

  return {
    escrowId: p.escrowId ?? p.id ?? args.escrow_id ?? null,
    jobId: p.jobId ?? null,
    network: p.network ?? null,
    asset: p.asset ?? p.currency ?? null,
    contractId:
      p.contractId ??
      p.escrowContractId ??
      p.escrowContract ??
      null,
    tokenContractId:
      p.tokenContractId ??
      p.tokenContract ??
      p.tokenAddress ??
      null,
    methodName,
    args,
    attachedDeposit,
    amount: p.amount ?? null,
    gas: p.gas ?? null,
    decimals: p.decimals ?? p.tokenDecimals ?? null,
    platformFee,
    title: p.title ?? args.title ?? null,
    description: p.description ?? args.description ?? null,
    clientWalletAddress: p.clientWalletAddress ?? null,
    freelancerWalletAddress: p.freelancerWalletAddress ?? null,
  };
}

function classify(error) {
  if (error instanceof WalletTxError) {
    return error;
  }

  const text = String(error?.message || error || "");

  if (/reject|cancel|denied|declin|closed|dismiss/i.test(text)) {
    return new WalletTxError(
      "cancelled",
      "The wallet request was cancelled."
    );
  }

  if (/not enough|insufficient|balance|exceeds/i.test(text)) {
    return new WalletTxError(
      "insufficient",
      "Your wallet balance is too low for this payment and network fees."
    );
  }

  return new WalletTxError(
    "failed",
    text || "The transaction failed."
  );
}

export function validatePreparation(prep, expectedAccountId) {
  if (
    !prep.escrowId ||
    !prep.methodName ||
    !prep.contractId
  ) {
    throw new WalletTxError(
      "failed",
      "The server returned an incomplete escrow preparation."
    );
  }

  if (
    prep.network &&
    String(prep.network).toUpperCase() !== APP_NETWORK
  ) {
    throw new WalletTxError(
      "wrong-network",
      `This escrow is prepared for ${prep.network}, but the app is on ${APP_NETWORK}.`
    );
  }

  if (
    CONFIGURED_CONTRACT &&
    prep.contractId !== CONFIGURED_CONTRACT
  ) {
    throw new WalletTxError(
      "failed",
      `The prepared escrow targets ${prep.contractId}, but this app is configured for ${CONFIGURED_CONTRACT}.`
    );
  }

  if (
    expectedAccountId &&
    prep.clientWalletAddress &&
    prep.clientWalletAddress !== expectedAccountId
  ) {
    throw new WalletTxError(
      "wrong-account",
      `The prepared escrow belongs to ${prep.clientWalletAddress}, but your linked wallet is ${expectedAccountId}.`
    );
  }

  const gas =
    prep.gas ??
    (prep.methodName === "ft_transfer_call"
      ? GAS_TOKEN
      : GAS_NEAR);

  if (!isPositiveInteger(gas)) {
    throw new WalletTxError(
      "failed",
      "The prepared gas amount is invalid."
    );
  }

  const args = prep.args;

  if (prep.methodName === "create_and_fund_with_near") {
    if (
      !args.escrow_id ||
      !args.freelancer ||
      !args.amount ||
      !args.title ||
      typeof args.description !== "string"
    ) {
      throw new WalletTxError(
        "failed",
        "The NEAR escrow preparation is missing required contract arguments."
      );
    }

    if (String(args.escrow_id) !== String(prep.escrowId)) {
      throw new WalletTxError(
        "failed",
        "The escrow ID does not match the contract arguments."
      );
    }

    if (
      !isPositiveInteger(args.amount) ||
      !isPositiveInteger(prep.platformFee) ||
      !isPositiveInteger(prep.attachedDeposit)
    ) {
      throw new WalletTxError(
        "failed",
        "The prepared NEAR amount or platform fee is not a valid whole number of yoctoNEAR."
      );
    }

    if (
      BigInt(String(args.amount)) + BigInt(String(prep.platformFee)) !==
      BigInt(String(prep.attachedDeposit))
    ) {
      throw new WalletTxError(
        "failed",
        "The project amount plus platform fee does not match the attached deposit."
      );
    }

    if (
      prep.freelancerWalletAddress &&
      args.freelancer !== prep.freelancerWalletAddress
    ) {
      throw new WalletTxError(
        "failed",
        "The freelancer wallet does not match the prepared transaction."
      );
    }

    return;
  }

  if (prep.methodName === "ft_transfer_call") {
    if (!["USDT", "USDC"].includes(String(prep.asset).toUpperCase())) {
      throw new WalletTxError(
        "failed",
        "The prepared token is not a supported stablecoin."
      );
    }

    if (!prep.tokenContractId) {
      throw new WalletTxError(
        "failed",
        "The token contract address is missing."
      );
    }

    if (args.receiver_id !== prep.contractId) {
      throw new WalletTxError(
        "failed",
        "The token transfer is not addressed to the escrow contract."
      );
    }

    if (!isPositiveInteger(args.amount)) {
      throw new WalletTxError(
        "failed",
        "The prepared token amount is invalid."
      );
    }

    if (
      !isPositiveInteger(prep.amount) ||
      !isNonNegativeInteger(prep.platformFee) ||
      String(prep.attachedDeposit) !== "1" ||
      BigInt(String(prep.gas ?? GAS_TOKEN)) < BigInt(GAS_NEAR)
    ) {
      throw new WalletTxError(
        "failed",
        "The prepared token amount, platform fee, deposit, or gas is invalid."
      );
    }

    let msg = args.msg;

    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        throw new WalletTxError(
          "failed",
          "The token transfer message is not valid JSON."
        );
      }
    }

    if (!msg || String(msg.escrow_id) !== String(prep.escrowId)) {
      throw new WalletTxError(
        "failed",
        "The token transfer message does not match the escrow ID."
      );
    }

    if (
      !isPositiveInteger(msg.amount) ||
      String(msg.amount) !== String(prep.amount) ||
      BigInt(String(msg.amount)) + BigInt(String(prep.platformFee)) !==
        BigInt(String(args.amount)) ||
      !msg.freelancer ||
      (prep.freelancerWalletAddress &&
        msg.freelancer !== prep.freelancerWalletAddress) ||
      typeof msg.title !== "string" ||
      msg.title.length > 200 ||
      typeof msg.description !== "string" ||
      msg.description.length > 5000 ||
      String(prep.title) !== msg.title
    ) {
      throw new WalletTxError(
        "failed",
        "The token transfer details do not match the prepared project amount, fee, or freelancer."
      );
    }

    return;
  }

  throw new WalletTxError(
    "failed",
    `Unsupported escrow method: ${prep.methodName}`
  );
}

export async function signPreparedEscrow(
  preparation,
  { expectedAccountId } = {}
) {
  const prep = normalizePreparation(preparation);

  validatePreparation(prep, expectedAccountId);

  const near = await import("./nearWallet.js");

  let signerId;

  try {
    signerId = await near.ensureWalletSession();
  } catch (error) {
    throw classify(error);
  }

  if (expectedAccountId && signerId !== expectedAccountId) {
    throw new WalletTxError(
      "wrong-account",
      `Switch your wallet to ${expectedAccountId}. Your current wallet is ${signerId}.`
    );
  }

  if (
    prep.clientWalletAddress &&
    signerId !== prep.clientWalletAddress
  ) {
    throw new WalletTxError(
      "wrong-account",
      `Your connected wallet (${signerId}) does not match the client wallet for this escrow (${prep.clientWalletAddress}).`
    );
  }

  const isToken = prep.methodName === "ft_transfer_call";
  const args = { ...prep.args };

  if (args.msg && typeof args.msg === "object") {
    args.msg = JSON.stringify(args.msg);
  }

  const receiverId = isToken
    ? prep.tokenContractId
    : prep.contractId;

  const deposit = isToken
    ? "1"
    : String(prep.attachedDeposit);

  const gas = String(
    prep.gas ?? (isToken ? GAS_TOKEN : GAS_NEAR)
  );

  console.info("[PayProof] Prepared transaction for signing", {
    receiverId,
    methodName: prep.methodName,
    accountId: signerId,
    network: prep.network,
    deposit,
    gas,
  });

  let outcome;

  try {
    outcome = await near.sendFunctionCall({
      receiverId,
      methodName: prep.methodName,
      args,
      gas,
      deposit,
    });
  } catch (error) {
    throw classify(error);
  }

  if (
    outcome?.status &&
    typeof outcome.status === "object" &&
    outcome.status.Failure
  ) {
    throw new WalletTxError(
      "failed",
      "The transaction failed on the NEAR blockchain."
    );
  }

  const hash =
    outcome?.transaction?.hash ??
    outcome?.transaction_outcome?.id ??
    outcome?.transaction_outcome?.outcome?.receipt_ids?.[0] ??
    null;

  if (!hash) {
    console.error(
      "[PayProof] Wallet returned no transaction hash.",
      outcome
    );
  }

  return {
    hash,
    outcome,
  };
}