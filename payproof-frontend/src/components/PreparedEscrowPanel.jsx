import { Wallet, LoaderCircle } from "lucide-react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { formatUnits } from "../services/units.js";
import { NETWORK_LABEL } from "../services/escrowService.js";

function amountText(amount) {
  return `${formatUnits(amount, 24)} NEAR`;
}

export default function PreparedEscrowPanel({
  prep,
  job,
  walletAddress,
  onApprove,
  onCancel,
  busy = false,
}) {
  const freelancer =
    prep.args?.freelancer ??
    prep.freelancerWalletAddress ??
    job?.freelancer ??
    "—";

  return (
    <Card title="Review and approve">
      <p className="card-lead">
        Your escrow is prepared. Nothing has been paid yet.
        Approve the transaction in your NEAR wallet to fund it.
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
        <strong>{amountText(prep.args?.amount)}</strong>
      </div>

      <div className="kv">
        <span>Client platform fee · 3.5%</span>
        <strong>{amountText(prep.platformFee)}</strong>
      </div>

      <div className="kv">
        <span>Total charged</span>
        <strong>{amountText(prep.attachedDeposit)}</strong>
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
        Funding counts only after PayProof verifies it on NEAR.
      </p>
    </Card>
  );
}