import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getClientJobs, getFreelancerJobs } from "../services/jobService.js";
import { formatAmount, formatDate, normalizeJob, prettyStatus, toList } from "../services/jobMapper.js";

export default function Projects() {
  const { user } = useAuth();
  const isFreelancer = user?.role === "FREELANCER";

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetcher = isFreelancer ? getFreelancerJobs : getClientJobs;

    setLoading(true);
    setError("");

    fetcher()
      .then((data) => {
        if (cancelled) return;

        const normalizedJobs = toList(data)
          .map(normalizeJob)
          .filter((job) => job?.id);

        setJobs(normalizedJobs);
      })
      .catch((err) => {
        if (!cancelled) {
          setJobs([]);
          setError(err.message || "Could not load your projects.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFreelancer]);

  const nextStep = (job) => {
    if (String(job.raw?.status || "").toUpperCase() === "COMPLETED") {
      return "View payment receipt";
    }
    if (isFreelancer && job.invitation === "pending") return "Review invitation";
    if (job.stage >= 3) return isFreelancer ? "Submit work" : "Review submission";
    if (job.stage === 2) return isFreelancer ? "View escrow status" : "Fund escrow";
    if (job.stage <= 1) return "Open agreement";
    return "Open project";
  };

  const nextLink = (job) => {
    if (String(job.raw?.status || "").toUpperCase() === "COMPLETED") {
      return `/projects/${job.id}/receipt`;
    }
    if (job.stage >= 3) return `/projects/${job.id}/submission`;
    return job.stage >= 2 ? `/escrow/${job.id}` : `/projects/${job.id}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Your projects"
        subtitle="Everything you are working on, in one place."
        actions={
          !isFreelancer && (
            <Link to="/projects/new" className="btn btn-primary">
              <Plus size={18} />
              New project
            </Link>
          )
        }
      />

      {error && <div className="form-error">{error}</div>}

      <Card>
        {loading ? (
          <p className="muted">Loading projects...</p>
        ) : jobs.length === 0 ? (
          <p className="muted">
            {isFreelancer
              ? "No invitations yet. Projects you're invited to will appear here."
              : "No projects yet. Create your first one to invite a freelancer."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Next step</th>
                </tr>
              </thead>

              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.title}</strong>
                      <span className="cell-sub">
                        {isFreelancer ? job.client : job.freelancer}
                      </span>
                    </td>

                    <td>{formatAmount(job.amount, job.currency)}</td>

                    <td>
                      <span className="pill pill-amber">
                        <span className="dot" />
                        {prettyStatus(job.statusText)}
                      </span>
                    </td>

                    <td>{formatDate(job.deadline)}</td>

                    <td>
                      <Link to={nextLink(job)} className="row-link">
                        {nextStep(job)} →
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