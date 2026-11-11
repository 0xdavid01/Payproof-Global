import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getClientJobs, getFreelancerJobs } from "../services/jobService.js";
import { getEscrowDisputeCase } from "../services/escrowCaseService.js";
import { getDisputeProposal } from "../services/disputeProposalService.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
  toList,
} from "../services/jobMapper.js";
import "../css/disputes.css";

const CLOSED = ["COMPLETED", "CANCELLED"];

// Turns a project's case and proposal data into a label, a colour and a sort rank.
function describe({ status, disputeCase, proposal }) {
  const closed = CLOSED.includes(status);
  const hasCase = !!(disputeCase || proposal || status === "DISPUTED");

  if (proposal && (proposal.canAccept || proposal.canReject)) {
    return { label: "Proposal awaiting your response", tone: "amber", rank: 0, hasCase, action: "Respond" };
  }
  if (proposal) {
    return {
      label: proposal.canRevoke ? "You accepted · waiting for the other party" : "Proposal open",
      tone: "amber",
      rank: 1,
      hasCase,
      action: "View dispute",
    };
  }
  if (hasCase && closed) {
    return { label: "Resolved", tone: "green", rank: 3, hasCase, action: "View dispute" };
  }
  if (disputeCase?.type === "REFUND_REQUEST") {
    return { label: "Refund requested", tone: "amber", rank: 1, hasCase, action: "View dispute" };
  }
  if (disputeCase) {
    return { label: "Dispute raised", tone: "amber", rank: 1, hasCase, action: "View dispute" };
  }
  if (status === "DISPUTED") {
    return { label: "Disputed", tone: "amber", rank: 1, hasCase, action: "View dispute" };
  }
  if (closed) {
    return { label: "Completed", tone: "muted", rank: 5, hasCase, action: "Open dispute page" };
  }
  return { label: "No case", tone: "muted", rank: 4, hasCase, action: "Open dispute page" };
}

export default function Disputes() {
  const { user } = useAuth();
  const isFreelancer = user?.role === "FREELANCER";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("cases");

  useEffect(() => {
    let cancelled = false;
    const fetcher = isFreelancer ? getFreelancerJobs : getClientJobs;

    setLoading(true);
    setError("");

    (async () => {
      try {
        const data = await fetcher();

        const funded = toList(data)
          .map(normalizeJob)
          .filter((job) => job?.id && job.escrowConfirmed && job.invitation !== "declined");

        const loaded = await Promise.all(
          funded.map(async (job) => {
            const status = String(job.raw?.status || "").toUpperCase();

            const [disputeCase, proposal] = await Promise.all([
              getEscrowDisputeCase(job.id).catch(() => null),
              status === "DISPUTED"
                ? getDisputeProposal(job.id).catch(() => null)
                : Promise.resolve(null),
            ]);

            return { job, status, disputeCase: disputeCase || null, proposal: proposal || null };
          })
        );

        if (!cancelled) setRows(loaded);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(err.message || "Could not load your disputes.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFreelancer]);

  const described = useMemo(
    () =>
      rows
        .map((row) => ({ ...row, info: describe(row) }))
        .sort((a, b) => a.info.rank - b.info.rank),
    [rows]
  );

  const withCases = described.filter((row) => row.info.hasCase);
  const visible = view === "cases" ? withCases : described;
  const needsResponse = described.filter((row) => row.info.rank === 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Disputes"
        title="Disputes & refunds"
        subtitle="Open cases, resolver proposals and anything waiting for your response."
      />

      {error && <div className="form-error">{error}</div>}

      {needsResponse > 0 && (
        <div className="disputes-alert" role="status">
          {needsResponse === 1
            ? "1 resolver proposal is waiting for your response."
            : `${needsResponse} resolver proposals are waiting for your response.`}
        </div>
      )}

      <div className="disputes-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "cases"}
          className={view === "cases" ? "active" : ""}
          onClick={() => setView("cases")}
        >
          With cases ({withCases.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          className={view === "all" ? "active" : ""}
          onClick={() => setView("all")}
        >
          All funded projects ({described.length})
        </button>
      </div>

      <Card>
        {loading ? (
          <p className="muted">Loading disputes...</p>
        ) : visible.length === 0 ? (
          <p className="muted">
            {view === "cases"
              ? "No disputes or refund requests. If something goes wrong on a funded project, you can raise a case from \"All funded projects\"."
              : "No funded projects yet. Disputes become available once escrow is funded."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Case</th>
                  <th>Raised</th>
                  <th>Next step</th>
                </tr>
              </thead>

              <tbody>
                {visible.map(({ job, disputeCase, info }) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.title}</strong>
                      <span className="cell-sub">
                        {isFreelancer ? job.client : job.freelancer}
                      </span>
                    </td>

                    <td>{formatAmount(job.amount, job.currency)}</td>

                    <td>
                      <span className={`disputes-pill disputes-pill-${info.tone}`}>
                        <span className="dot" />
                        {info.label}
                      </span>
                    </td>

                    <td>{disputeCase?.createdAt ? formatDate(disputeCase.createdAt) : "—"}</td>

                    <td>
                      <Link to={`/projects/${job.id}/dispute`} className="row-link">
                        {info.action} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}