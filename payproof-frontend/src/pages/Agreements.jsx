import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getClientJobs, getFreelancerJobs } from "../services/jobService.js";
import { formatAmount, normalizeJob, toList } from "../services/jobMapper.js";

function agreementLabel(job) {
  if (job.invitation === "declined") return { text: "Declined", tone: "muted" };
  if (job.invitation === "pending") return { text: "Awaiting acceptance", tone: "muted" };
  if (job.contract.approved) return { text: "Mutually approved", tone: "green" };
  if (!job.contract.exists) return { text: "Awaiting contract", tone: "amber" };
  return { text: "In review", tone: "amber" };
}

export default function Agreements() {
  const { user } = useAuth();
  const isFreelancer = user?.role === "FREELANCER";

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetcher = isFreelancer ? getFreelancerJobs : getClientJobs;

    fetcher()
      .then((data) => {
        if (!cancelled) setJobs(toList(data).map(normalizeJob));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load agreements.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFreelancer]);

  const accepted = jobs.filter((j) => j.invitation === "accepted");

  return (
    <>
      <PageHeader
        eyebrow="Agreements"
        title="Your agreements"
        subtitle="Compare, review and approve the exact version you'll work from."
      />

      {error && <div className="form-error">{error}</div>}

      <Card>
        {loading ? (
          <p className="muted">Loading agreements...</p>
        ) : accepted.length === 0 ? (
          <p className="muted">
            No agreements yet. They appear here once a freelancer accepts an invitation.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Agreement</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {accepted.map((job) => {
                  const label = agreementLabel(job);
                  return (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.title}</strong>
                        <span className="cell-sub">
                          {isFreelancer ? job.client : job.freelancer}
                        </span>
                      </td>
                      <td>{formatAmount(job.amount, job.currency)}</td>
                      <td>
                        <span className={`pill pill-${label.tone}`}>
                          <span className="dot" />
                          {label.text}
                        </span>
                      </td>
                      <td>
                        <Link to={`/agreements/${job.id}`} className="row-link">
                          Review agreement →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}