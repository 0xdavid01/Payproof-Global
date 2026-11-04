import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, FileText } from "lucide-react";
import "../css/submission.css";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSubmissions } from "../services/submissionService.js";
import { formatDate, toList } from "../services/jobMapper.js";

function formatSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function SubmissionVersion() {
  const { jobId, versionId } = useParams();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const isFreelancer = user?.role === "FREELANCER";
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isClient && !isFreelancer) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    getSubmissions(jobId)
      .then((data) => {
        if (cancelled) return;
        const found = toList(data).find(
          (submission) => String(submission.id) === String(versionId)
        );
        if (!found) {
          setError("This submission version could not be found.");
          return;
        }
        setVersion(found);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not load this submission version.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isClient, isFreelancer, jobId, versionId]);

  const reviewUrl = `/projects/${jobId}/submission`;

  if (!isClient && !isFreelancer) {
    return (
      <>
        <PageHeader eyebrow="Delivery" title="Submission version" />
        <Card title="Project access only">
          <p className="muted">Only the project client or assigned freelancer can view submission versions.</p>
          <Link to={reviewUrl} className="btn btn-secondary spaced-top">
            Back to project delivery
          </Link>
        </Card>
      </>
    );
  }

  if (loading) return <p className="muted">Loading submission version...</p>;

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title={version ? `Submission · Version ${version.versionNumber}` : "Submission version"}
        subtitle="View the files, delivery message, and review outcome for this version."
      />

      {error && <div className="form-error spaced">{error}</div>}

      {version && (
        <>
          {String(version.status).toUpperCase() === "CHANGES_REQUESTED" && (
            <div className="callout callout-warn spaced" role="status">
              <strong>This version was rejected.</strong>
              <p>
                {version.reviewFeedback ||
                  "The client requested changes. Review the feedback, then submit an updated version."}
              </p>
              {isFreelancer && (
                <Link to={reviewUrl} className="btn btn-primary spaced-top">
                  Submit revised work
                </Link>
              )}
            </div>
          )}
          <Card title="Version details">
            <div className="submit-result">
            <div className="kv">
              <span>Status</span>
              <strong>
                {String(version.status || "SUBMITTED")
                  .replace(/_/g, " ")
                  .toLowerCase()}
              </strong>
            </div>
            {version.submittedAt && (
              <div className="kv">
                <span>Submitted</span>
                <strong>{formatDate(version.submittedAt)}</strong>
              </div>
            )}

            {version.fileName && (
              <div className="file-row">
                <FileText size={22} />
                <div className="file-meta">
                  <strong>{version.fileName}</strong>
                  <span className="muted">{formatSize(version.fileSizeBytes)}</span>
                </div>
                {version.fileUrl && (
                  <a
                    className="icon-btn"
                    href={version.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${version.fileName}`}
                  >
                    <ArrowUpRight size={20} />
                  </a>
                )}
              </div>
            )}

            {isHttpUrl(version.externalUrl) && (
              <p>
                <a
                  href={version.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open delivery link <ArrowUpRight size={14} />
                </a>
              </p>
            )}

            {version.notes && (
              <div>
                <strong>Message from the freelancer</strong>
                <p className="quote">{version.notes}</p>
              </div>
            )}

            {version.reviewFeedback &&
              String(version.status).toUpperCase() !== "CHANGES_REQUESTED" && (
                <div>
                  <strong>Client review note</strong>
                  <p className="quote">{version.reviewFeedback}</p>
                </div>
              )}

            <Link to={reviewUrl} className="btn btn-secondary spaced-top">
              Back to submission history
            </Link>
          </div>
          </Card>
        </>
      )}
    </>
  );
}
