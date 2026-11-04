import { useEffect } from "react";
import { Wallet } from "lucide-react";
import Button from "./Button.jsx";
import { formatAmount } from "../services/jobMapper.js";
import { NETWORK_LABEL } from "../services/escrowService.js";

export default function EscrowConfirmationModal({ open, job, walletAddress, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !job) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="escrow-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="escrow-confirm-title" className="modal-title">
          Confirm your funding
        </h2>
        <p className="muted">
          Review the details. Your wallet opens next, and nothing is paid until you approve there.
        </p>

        <div className="modal-rows">
          <div className="kv"><span>Project</span><strong>{job.title}</strong></div>
          <div className="kv"><span>Paying</span><strong>{job.freelancer || "—"}</strong></div>
          <div className="kv"><span>Amount</span><strong>{formatAmount(job.amount, job.currency)}</strong></div>
          <div className="kv"><span>Network</span><strong>{NETWORK_LABEL}</strong></div>
          <div className="kv"><span>Your wallet</span><strong className="mono">{walletAddress}</strong></div>
          <div className="kv"><span>Escrow ID</span><strong>Assigned when you confirm</strong></div>
        </div>

        <div className="action-row">
          <Button icon={Wallet} onClick={onConfirm}>
            Confirm and open wallet
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}