import { STATUS_LABELS, statusKey } from "../services/escrowService.js";

export default function EscrowStatusBadge({ status }) {
  const info = STATUS_LABELS[statusKey(status)] || { label: status || "Not funded", tone: "muted" };

  return (
    <span className={`pill pill-${info.tone}`}>
      <span className="dot" />
      {info.label}
    </span>
  );
}