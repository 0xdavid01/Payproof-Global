import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getClientJobs, getFreelancerJobs } from "../services/jobService.js";
import { formatAmount, formatDate, normalizeJob, toList } from "../services/jobMapper.js";

export default function Escrow() {
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
        if (cancelled) return;
        setJobs(
          toList(data)
            .map(normalizeJob)
            .filter((job) => job?.id && job.stage >= 2)
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load escrows.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFreelancer]);

  return (
    <>
      <PageHeader
        eyebrow="Escrow"
        title="Your escrows"
        subtitle="Projects whose agreement is approved, ready for funding or already funded."
      />

      {error && <div className="form-error">{error}</div>}

      <Card>
        {loading ? (
          <p className="muted">Loading escrows...</p>
        ) : jobs.length === 0 ? (
          <p className="muted">
            Nothing here yet. A project appears once both parties approve its agreement.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Escrow</th>
                  <th>Due</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const funded = job.stage >= 3;
                  return (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.title}</strong>
                        <span className="cell-sub">{isFreelancer ? job.client : job.freelancer}</span>
                      </td>
                      <td>{formatAmount(job.amount, job.currency)}</td>
                      <td>
                        <span className={`pill ${funded ? "pill-green" : "pill-amber"}`}>
                          <span className="dot" />
                          {funded ? "Funded" : isFreelancer ? "Awaiting client funding" : "Ready to fund"}
                        </span>
                      </td>
                      <td>{formatDate(job.deadline)}</td>
                      <td>
                        <Link to={`/escrow/${job.id}`} className="row-link">
                          {funded ? "View escrow" : isFreelancer ? "View status" : "Fund escrow"} →
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