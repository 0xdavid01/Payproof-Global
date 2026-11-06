import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileCheck,
  FileText,
  FolderPlus,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { getActivity } from "../services/activityService.js";
import "../css/activity.css";

const ACTION_ICONS = {
  PROJECT_CREATED: FolderPlus,
  PRD_UPLOADED: FileText,
  CHECKLIST_APPROVED: CheckCircle2,
  CHECKLIST_PROGRESS_UPDATED: CheckCircle2,
  INVITATION_ACCEPTED: UserRoundCheck,
  INVITATION_DECLINED: UserRoundCheck,
  AGREEMENT_UPLOADED: FileText,
  AGREEMENT_CHANGES_REQUESTED: FileCheck,
  AGREEMENT_APPROVED: CheckCircle2,
  FINANCIAL_TERMS_UPDATED: Wallet,
  ESCROW_FUNDED: ShieldCheck,
  WORK_SUBMITTED: FileText,
  DELIVERY_REQUIREMENTS_REVIEWED: CheckCircle2,
  DELIVERY_CHANGES_REQUESTED: FileCheck,
  DELIVERY_APPROVED: CheckCircle2,
  DISPUTE_RAISED: ShieldCheck,
  REFUND_REQUESTED: Wallet,
};

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function actorRoleLabel(role) {
  if (role === "CLIENT") return "Client";
  if (role === "FREELANCER") return "Freelancer";
  return "Participant";
}

export default function Activity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const loadActivity = useCallback(async () => {
    try {
      const response = await getActivity();
      setEvents(Array.isArray(response) ? response : []);
    } catch (loadError) {
      setError(loadError.message || "Could not load project activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity, reloadKey]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Activity"
        subtitle="A chronological log of meaningful actions by you and the other participants across your projects."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadKey((key) => key + 1);
            }}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh activity
          </button>
        }
      />

      {error && <div className="form-error spaced" role="alert">{error}</div>}

      <Card>
        {loading ? (
          <p className="muted">Loading activity...</p>
        ) : error ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadKey((key) => key + 1);
            }}
          >
            Try again
          </button>
        ) : events.length === 0 ? (
          <div className="activity-empty">
            <Clock3 size={24} />
            <p>No project activity has been recorded yet.</p>
            <span>Meaningful project actions by either participant will appear here.</span>
          </div>
        ) : (
          <ol className="activity-list">
            {events.map((event) => {
              const Icon = ACTION_ICONS[event.action] || Clock3;
              return (
                <li className="activity-item" key={event.id}>
                  <span className="activity-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div className="activity-content">
                    <p className="activity-summary">{event.summary}</p>
                    <div className="activity-meta">
                      <strong>{event.actorName || "Project participant"}</strong>
                      <span>{actorRoleLabel(event.actorRole)}</span>
                      <span>{event.projectTitle}</span>
                      <time dateTime={event.occurredAt}>
                        {formatTimestamp(event.occurredAt)}
                      </time>
                    </div>
                  </div>
                  <Link
                    className="row-link activity-project-link"
                    to={`/projects/${encodeURIComponent(event.jobId)}`}
                    aria-label={`Open project ${event.projectTitle}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
