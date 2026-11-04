import { ExternalLink } from "lucide-react";
import Button from "./Button.jsx";
import { explorerTxUrl } from "../services/escrowService.js";

const FAILURE_TEXT = {
  cancelled: "Transaction cancelled. No successful funding was confirmed.",
  failed: "Transaction failed. Please review the transaction and try again.",
};

function TxLink({ hash }) {
  if (!hash) return null;
  return (
    <a className="row-link" href={explorerTxUrl(hash)} target="_blank" rel="noopener noreferrer">
      View transaction <ExternalLink size={14} />
    </a>
  );
}

export default function EscrowTransactionStatus({
  phase,
  failureKind,
  message,
  txHash,
  escrowId,
  onRetry,
  onCheck,
}) {
  if (phase === "idle" || phase === "ready") return null;

  let tone = "info";
  let title = "";
  let body = "";
  let spinner = false;

  switch (phase) {
    case "preparing":
      title = "Preparing your escrow";
      body = message || "PayProof is reserving the escrow for this project.";
      spinner = true;
      break;
    case "awaiting_wallet":
      title = "Waiting for wallet confirmation";
      body =
        message ||
        "Approve the transaction in your connected NEAR wallet. Nothing has been funded yet.";
      spinner = true;
      break;
    case "submitted":
    case "verifying":
      title = "Transaction submitted. Waiting for network confirmation.";
      body = message || "PayProof is verifying the transaction on NEAR. Keep this page open.";
      spinner = true;
      break;
    case "confirmed":
      tone = "success";
      title = "Escrow successfully funded.";
      body = "The payment is held in escrow until the work is approved.";
      break;
    case "unknown":
      tone = "warn";
      title = "Transaction submitted. We are verifying its status.";
      body = message || "Please do not initiate another funding attempt.";
      break;
    case "failed":
      tone = "error";
      title = FAILURE_TEXT[failureKind] || message || FAILURE_TEXT.failed;
      body = FAILURE_TEXT[failureKind] && message ? message : "";
      break;
    default:
      return null;
  }

  return (
    <div className={`tx-panel tx-${tone}`} role="status">
      <div className="tx-head">
        {spinner && <span className="tx-spinner" aria-hidden="true" />}
        <strong>{title}</strong>
      </div>
      {body && <p>{body}</p>}

      {(txHash || escrowId) && (
        <div className="tx-meta">
          {escrowId && <span>Escrow ID · {escrowId}</span>}
          {txHash && <span className="mono">Tx · {txHash}</span>}
          <TxLink hash={txHash} />
        </div>
      )}

      {phase === "unknown" && onCheck && (
        <div className="action-row">
          <Button variant="secondary" onClick={onCheck}>
            Check status
          </Button>
        </div>
      )}

      {phase === "failed" && onRetry && (
        <div className="action-row">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}