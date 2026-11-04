import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Download,
  FileText,
  Send,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import ProjectStepper from "../components/ProjectStepper.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import FinancialTermsCard from "../components/FinancialTermsCard.jsx";
import ProjectChecklist from "../components/ProjectChecklist.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import {
  acceptInvitation,
  declineInvitation,
  getJob,
  updateChecklistProgress,
} from "../services/jobService.js";
import { resolveFileUrl } from "../services/jobFiles.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
  prettyStatus,
} from "../services/jobMapper.js";

export default function ProjectDetail() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const { address, isConnected, loading: walletLoading, busy: walletBusy, connect } = useWallet();
  const navigate = useNavigate();
  const isClient = user?.role === "CLIENT";
  const isFreelancer = user?.role === "FREELANCER";

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const [savingChecklist, setSavingChecklist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getJob(jobId);
      const normalizedJob = normalizeJob(response);

      if (!normalizedJob?.id) {
        throw new Error("The project response did not contain a valid project ID.");
      }

      setJob(normalizedJob);
    } catch (err) {
      setJob(null);
      setError(err.message || "Could not load this project.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAccept = async () => {
    setError("");

    if (walletLoading) {
      setError("Please wait while we check your linked wallet.");
      return;
    }

    if (!isConnected || !address) {
      setError("Connect and link your freelancer NEAR wallet before accepting this invitation.");
      return;
    }

    setBusy("accept");

    try {
      const { ensureWalletSessionMatches } = await import("../services/nearWallet.js");
      await ensureWalletSessionMatches(address);
      await acceptInvitation(jobId);
      navigate(`/agreements/${jobId}`, { replace: true });
    } catch (err) {
      setError(err.message || "Could not accept the invitation.");
    } finally {
      setBusy("");
    }
  };

  const handleDecline = async () => {
    if (!window.confirm("Decline this invitation? Nothing is signed and no funds move.")) {
      return;
    }

    setError("");
    setBusy("decline");

    try {
      await declineInvitation(jobId);
      navigate("/projects", { replace: true });
    } catch (err) {
      setError(err.message || "Could not decline the invitation.");
    } finally {
      setBusy("");
    }
  };

  const handleRequirementChange = async (requirementIndex, isDone) => {
    if (!isClient || savingChecklist || !job) {
      return;
    }

    const originalRequirements = job.requirements || [];

    const updatedRequirements = originalRequirements.map((requirement, index) =>
      index === requirementIndex
        ? { ...requirement, isDone }
        : { ...requirement }
    );

    setError("");
    setSavingChecklist(true);

    setJob((current) => ({
      ...current,
      requirements: updatedRequirements,
    }));

    try {
      const response = await updateChecklistProgress(
        jobId,
        updatedRequirements.map(({ isDone, condition }) => ({
          isDone: Boolean(isDone),
          condition,
        }))
      );

      if (response) {
        const updatedJob = normalizeJob(response);

        if (updatedJob?.id) {
          setJob(updatedJob);
        } else if (Array.isArray(response.requirements)) {
          setJob((current) => ({
            ...current,
            requirements: response.requirements,
          }));
        }
      }
    } catch (err) {
      setJob((current) => ({
        ...current,
        requirements: originalRequirements,
      }));

      setError(
        err.message || "Could not update the checklist. Please try again."
      );
    } finally {
      setSavingChecklist(false);
    }
  };

  if (loading) return <p className="muted">Loading project...</p>;

  if (!job) {
    return (
      <>
        <PageHeader eyebrow="Projects" title="Project not found" />
        {error && <div className="form-error">{error}</div>}
      </>
    );
  }

  const pending = isFreelancer && job.invitation === "pending";
  const declined = job.invitation === "declined";
  const otherParty = isFreelancer ? job.client : job.freelancer;
  const clientFirstName = job.client?.trim()?.split(/\s+/)[0] || "a client";
  const requirements = Array.isArray(job.requirements)
    ? job.requirements
    : [];

  const prdHref =
    job.prdName || job.prdUrl
      ? resolveFileUrl("prd", job.id, job.prdUrl)
      : null;

  return (
    <>
      <PageHeader
        eyebrow={`Projects / ${job.title} / ${pending ? "Invitation" : "Overview"} · ${formatDate(job.createdAt)}`}
        title={pending ? `A new project from ${clientFirstName}.` : job.title}
        subtitle={
          pending
            ? "Review the brief and requirements before deciding whether this project is right for you."
            : "Brief, requirements and where this project stands."
        }
      />

      <ProjectStepper current={job.stage} jobId={job.id} />

      {error && <div className="form-error spaced">{error}</div>}

      <div className="project-grid">
        <div className="stack">
          <Card title={job.title}>
            <p className="status-line">
              <span className="dot" />
              {declined
                ? "Invitation declined"
                : pending
                  ? "Invitation pending"
                  : prettyStatus(job.statusText)}
            </p>

            {job.description && <p className="quote">{job.description}</p>}

            {otherParty && (
              <p className="muted small">
                {isFreelancer ? "Client" : "Freelancer"} ·{" "}
                <strong>{otherParty}</strong>
              </p>
            )}
          </Card>

          <Card title="PRD & requirements" className="prd-requirements-card">
            {job.prdName && (
              <div className="file-row">
                <FileText size={22} />
                <div className="file-meta">
                  <strong>{job.prdName}</strong>
                  <span className="muted">
                    Shared {formatDate(job.createdAt)}
                  </span>
                </div>

                {prdHref && (
                  <a
                    href={prdHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-btn"
                    aria-label="Open PRD"
                  >
                    <Download size={20} />
                  </a>
                )}
              </div>
            )}

            <ProjectChecklist
              requirements={requirements}
              isClient={isClient}
              saving={savingChecklist}
              onToggle={handleRequirementChange}
            />
          </Card>

          {pending && (
            <>
              <div className="callout callout-row">
                <ShieldCheck size={22} />
                <div>
                  <strong>Accepting is not signing</strong>
                  <p>
                    Accepting opens the agreement workspace. You won't be
                    committed to the final terms until you review and approve
                    the agreement. Do not start work until client funding is
                    confirmed.
                  </p>
                </div>
              </div>

              <Card title="Your decision">
                <label className="check spaced-bottom">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I have reviewed the PRD and want to proceed to the agreement
                  stage. I can still propose changes before signing.
                </label>

                <div className="action-row">
                  <Button
                    icon={ArrowRight}
                    onClick={handleAccept}
                    disabled={!reviewed || !!busy}
                  >
                    {busy === "accept"
                      ? "Accepting..."
                      : "Accept & review agreement"}
                  </Button>

                  <Button
                    variant="danger"
                    onClick={handleDecline}
                    disabled={!!busy}
                  >
                    {busy === "decline"
                      ? "Declining..."
                      : "Decline invitation"}
                  </Button>
                </div>
                {(!isConnected || (error && /wallet|account/i.test(error))) && (
                  <p className="muted small spaced-top">
                    {isConnected
                      ? "Reconnect the NEAR wallet linked to your freelancer account. "
                      : "Connect your freelancer NEAR wallet before accepting. "}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={connect}
                      disabled={walletLoading || !!walletBusy}
                    >
                      {walletBusy === "connect"
                        ? "Connecting..."
                        : isConnected
                          ? "Reconnect wallet"
                          : "Connect wallet"}
                    </button>
                  </p>
                )}

                <p className="muted small spaced-top">
                  Declining notifies the client. No agreement is signed and no
                  funds move.
                </p>
              </Card>
            </>
          )}

          {!pending && !declined && (
            <Card title="Next step">
              <p className="card-lead">
                {job.stage <= 1
                  ? "Review the agreement. Both parties must approve the same version before funding opens."
                  : "Open the agreement to see the approved terms."}
              </p>

              <Link to={`/agreements/${job.id}`} className="btn btn-primary">
                <ArrowRight size={18} />
                Open agreement
              </Link>
            </Card>
          )}

          {isFreelancer && job.escrowConfirmed && !declined && (
            <Card title="Delivery">
              <p className="card-lead">
                Escrow is funded. When your work is ready, submit it for your client's review.
                Submitting does not release any funds.
              </p>

              <Link to={`/projects/${job.id}/submission`} className="btn btn-primary">
                <Send size={18} />
                Submit work
              </Link>
            </Card>
          )}

          {isClient && job.escrowConfirmed && !declined && (
            <Card title="Delivery">
              <p className="card-lead">
                Review the freelancer's submitted work and approve it when the
                delivery meets the agreed requirements.
              </p>

              <Link to={`/projects/${job.id}/submission`} className="btn btn-primary">
                <ArrowRight size={18} />
                Review submission
              </Link>
            </Card>
          )}
        </div>

        <aside className="stack">
          <Card title="Project snapshot">
            <h3 className="snapshot-title">{job.title}</h3>

            <p className="muted small">
              {declined
                ? "Declined"
                : pending
                  ? "Invited · Awaiting your decision"
                  : prettyStatus(job.statusText)}
            </p>

            <hr className="rule" />

            <div className="kv">
              <span>Client</span>
              <strong>{job.client || "—"}</strong>
            </div>

            <div className="kv">
              <span>Freelancer</span>
              <strong>{job.freelancer || "—"}</strong>
            </div>

            <div className="kv">
              <span>Amount</span>
              <strong>{formatAmount(job.amount, job.currency)}</strong>
            </div>

            <div className="kv">
              <span>Delivery</span>
              <strong>{formatDate(job.deadline)}</strong>
            </div>

            <p className="muted small spaced-top">
              {job.id} · Created {formatDate(job.createdAt)}
            </p>
          </Card>

          {!isFreelancer && !declined && (
            <FinancialTermsCard
              job={job}
              onUpdated={(updated) => setJob(updated)}
            />
          )}

          <Card title="Payment protection">
            <div className="kv">
              <span>
                {isFreelancer ? "Your project payment" : "Project amount"}
              </span>
              <strong>{formatAmount(job.amount, job.currency)}</strong>
            </div>

            {isFreelancer && (
              <div className="kv">
                <span>Freelancer platform fee</span>
                <strong>0 {job.currency}</strong>
              </div>
            )}

            <p className="status-line spaced-top">
              <span className="dot dot-muted" />
              {job.stage >= 3 ? "Funded" : "Not funded yet"}
            </p>

            <p className="muted small">
              {isFreelancer
                ? "The client funds escrow after mutual approval. You'll see confirmation before work begins."
                : "You fund escrow after both parties approve the agreement."}
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}