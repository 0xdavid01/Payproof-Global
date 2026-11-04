import { ExternalLink } from "lucide-react";
import Card from "./Card.jsx";
import EscrowStatusBadge from "./EscrowStatusBadge.jsx";
import { formatAmount } from "../services/jobMapper.js";
import { explorerTxUrl, NETWORK_LABEL } from "../services/escrowService.js";

export default function EscrowDetails({ job, escrow, txHash }) {
  const hash = escrow?.txHash || txHash;

  return (
    <Card title="Escrow details">
      <div className="kv">
        <span>Status</span>
        <EscrowStatusBadge status={escrow?.status || "Funded"} />
      </div>
      <div className="kv"><span>Escrow ID</span><strong>{escrow?.escrowId || "—"}</strong></div>
      <div className="kv"><span>Project</span><strong>{job.title}</strong></div>
      <div className="kv">
        <span>Funded amount</span>
        <strong>{formatAmount(job.amount, job.currency)}</strong>
      </div>
      <div className="kv">
        <span>Freelancer</span>
        <strong>{escrow?.freelancer || job.freelancer || "—"}</strong>
      </div>
      <div className="kv"><span>Network</span><strong>{NETWORK_LABEL}</strong></div>

      {hash && (
        <p className="spaced-top">
          <a
            className="row-link"
            href={explorerTxUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="mono">{hash.slice(0, 8)}…{hash.slice(-6)}</span> · View on NEAR Explorer{" "}
            <ExternalLink size={14} />
          </a>
        </p>
      )}
    </Card>
  );
}