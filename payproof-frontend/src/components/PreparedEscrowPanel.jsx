import { Wallet, LoaderCircle } from "lucide-react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { formatUnits } from "../services/units.js";
import { NETWORK_LABEL } from "../services/escrowService.js";

function getTokenMessage(args) {
  if (typeof args?.msg !== "string") {
    return args?.msg ?? null;
  }

  try {
    return JSON.parse(args.msg);
  } catch {
    return null;
  }
}

export default function PreparedEscrowPanel({
  prep,
  job,
  walletAddress,
  onApprove,
  onCancel,
  busy = false,
}) {
  const isToken = prep.methodName === "ft_transfer_call";
  const currency = isToken
    ? String(prep.asset || job?.currency || "USDT").toUpperCase()
    : "NEAR";
  const decimals = isToken ? 6 : 24;
  const tokenMessage = isToken ? getTokenMessage(prep.args) : null;
  const projectAmount = isToken
    ? tokenMessage?.amount
    : prep.args?.amount;
  const totalAmount = isToken
    ? prep.args?.amount
    : prep.attachedDeposit;
  const amountText = (amount) =>
    `${formatUnits(amount, decimals)} ${currency}`;

  const freelancer =
    prep.args?.freelancer ??
    tokenMessage?.freelancer ??
    prep.freelancerWalletAddress ??
    job?.freelancer ??
    "—";

  return (
    <Card title="Review and approve">
      <p className="card-lead">
        Your escrow is prepared. Nothing has been paid yet.
        Approve the transaction in your NEAR wallet to fund it with {currency}.
      </p>

      <div className="kv">
        <span>Escrow ID</span>
        <strong className="mono">{prep.escrowId}</strong>
      </div>

      <div className="kv">
        <span>Project</span>
        <strong>{prep.title || job?.title || "—"}</strong>
      </div>

      <div className="kv">
        <span>Project amount</span>
        <strong>{amountText(projectAmount)}</strong>
      </div>

      <div className="kv">
        <span>Client platform fee · 3.5%</span>
        <strong>{amountText(prep.platformFee)}</strong>
      </div>

      <div className="kv">
        <span>Total charged</span>
        <strong>{amountText(totalAmount)}</strong>
      </div>

      <div className="kv">
        <span>Paying freelancer</span>
        <strong className="mono">{freelancer}</strong>
      </div>

      <div className="kv">
        <span>From your wallet</span>
        <strong className="mono">{walletAddress || "—"}</strong>
      </div>

      <div className="kv">
        <span>Escrow contract</span>
        <strong className="mono">{prep.contractId}</strong>
      </div>

      {isToken && (
        <div className="kv">
          <span>{currency} token contract</span>
          <strong className="mono">{prep.tokenContractId}</strong>
        </div>
      )}

      <div className="kv">
        <span>Method</span>
        <strong className="mono">{prep.methodName}</strong>
      </div>

      <div className="kv">
        <span>Network</span>
        <strong>{NETWORK_LABEL}</strong>
      </div>

      <div className="action-row spaced-top">
        <Button
          icon={busy ? LoaderCircle : Wallet}
          onClick={onApprove}
          disabled={busy}
        >
          {busy ? "Waiting for wallet..." : "Approve in wallet"}
        </Button>

        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Not now
        </Button>
      </div>

      <p className="muted small spaced-top">
        Your wallet will show the transaction before you approve it.
        Funding counts only after PayProof verifies it on {NETWORK_LABEL}.
      </p>
    </Card>
  );
}