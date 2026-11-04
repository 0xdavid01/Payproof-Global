import { Link } from "react-router-dom";
import { CircleCheck, CircleX, Circle } from "lucide-react";

// items: [{ id, label, detail, status: "ok" | "fail" | "pending" | "blocked",
//           action?: { label, onClick?, to?, disabled? } }]
function StatusIcon({ status }) {
  if (status === "ok") return <CircleCheck size={22} />;
  if (status === "fail") return <CircleX size={22} />;
  if (status === "pending") return <span className="tx-spinner" aria-hidden="true" />;
  return <Circle size={22} />;
}

export default function FundingChecklist({ items }) {
  return (
    <ul className="fund-checks">
      {items.map((item) => (
        <li key={item.id} className={`fund-check fund-check-${item.status}`}>
          <span className="fund-check-icon">
            <StatusIcon status={item.status} />
          </span>

          <div className="fund-check-body">
            <strong>{item.label}</strong>
            <span className="muted">{item.detail}</span>
          </div>

          {item.action &&
            (item.action.to ? (
              <Link to={item.action.to} className="btn btn-secondary btn-sm">
                {item.action.label}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={item.action.onClick}
                disabled={item.action.disabled}
              >
                {item.action.label}
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}