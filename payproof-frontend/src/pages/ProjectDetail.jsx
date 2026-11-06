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
import {
  getEscrowDisputeCase,
  raiseEscrowDispute,
  requestEscrowRefund,
} from "../services/escrowCaseService.js";
import { explorerTxUrl } from "../services/escrowService.js";

const pendingCaseKey = (jobId) => `payproof_escrow_case_tx_${jobId}`;

function readPendingCaseTx(jobId) {
  try {
    const raw = sessionStorage.getItem(pendingCaseKey(jobId));
    return raw ? JSON.parse(raw) : null;
  } catch (storageError) {
    console.warn("[PayProof] Could not restore the dispute transaction:", storageError);
    return null;
  }
}

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
  const [disputeCase, setDisputeCase] = useState(null);
  const [caseError, setCaseError] = useState("");
  const [caseReason, setCaseReason] = useState("");
  const [caseBusy, setCaseBusy] = useState("");
  const [pendingCaseTx, setPendingCaseTx] = useState(() => readPendingCaseTx(jobId));
  const [currentTime, setCurrentTime] = useState(() => Date.now());

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
      setCaseError("");
      try {
        setDisputeCase(await getEscrowDisputeCase(jobId));
      } catch (caseLoadError) {
        setDisputeCase(null);
        setCaseError(
          caseLoadError.message || "Could not load the escrow dispute record."
        );
      }
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

  useEffect(() => {
    const saved = readPendingCaseTx(jobId);
    setPendingCaseTx(saved);
    setDisputeCase(null);
    setCaseReason(saved?.reason || "");
  }, [jobId]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const handleEscrowCase = async (type) => {
    setCaseError("");
    let transaction = pendingCaseTx;

    const reason = caseReason.trim();
    if (!reason || reason.length > 500) {
      setCaseError("Provide a reason of 1 to 500 characters.");
      return;
    }
    if (walletLoading) {
      setCaseError("Please wait while we check your linked wallet.");
      return;
    }
    if (!isConnected || !address) {
      setCaseError("Connect and link your NEAR wallet before raising a case.");
      return;
    }
    if (!job?.escrowId || !job.escrowConfirmed) {
      setCaseError("This project does not have confirmed escrow.");
      return;
    }
    if (
      type === "REFUND_REQUEST" &&
      (!isClient || !job.deadline || new Date(job.deadline).getTime() >= Date.now())
    ) {
      setCaseError("A refund can only be requested by the client after the project deadline.");
      return;
    }

    if (
      pendingCaseTx &&
      (pendingCaseTx.type !== type || pendingCaseTx.reason !== reason)
    ) {
      setCaseError(
        "A NEAR dispute transaction is already pending backend confirmation. Retry the original request before changing its type or reason."
      );
      return;
    }

    setCaseBusy(type);
    try {
      if (!transaction) {
        const near = await import("../services/nearWallet.js");
        const transactionHash =
          type === "REFUND_REQUEST"
            ? await near.requestRefundOnChain(job.escrowId, reason, address)
            : await near.raiseDisputeOnChain(job.escrowId, reason, address);
        transaction = { type, reason, transactionHash };
        setPendingCaseTx(transaction);
        sessionStorage.setItem(pendingCaseKey(jobId), JSON.stringify(transaction));
      }

      const createCase =
        type === "REFUND_REQUEST" ? requestEscrowRefund : raiseEscrowDispute;
      const savedCase = await createCase(jobId, {
        reason: transaction.reason,
        transactionHash: transaction.transactionHash,
      });

      sessionStorage.removeItem(pendingCaseKey(jobId));
      setPendingCaseTx(null);
      setDisputeCase(savedCase);
      setCaseReason("");
      await load();
    } catch (caseSubmitError) {
      const pending = transaction || readPendingCaseTx(jobId);
      if (pending?.transactionHash) {
        setPendingCaseTx(pending);
        setCaseError(
          `NEAR recorded transaction ${pending.transactionHash}, but PayProof could not save the case yet. Retry the same request to finish verification and logging; do not submit a second transaction. ${
            caseSubmitError.message || ""
          }`.trim()
        );
      } else {
        setCaseError(
          caseSubmitError.message || "Could not submit the escrow case."
        );
      }
    } finally {
      setCaseBusy("");
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
  const projectStatus = String(job.raw?.status || "").toUpperCase();
  const projectCompleted = ["COMPLETED", "CANCELLED"].includes(projectStatus);
  const projectDisputed = projectStatus === "DISPUTED";
  const deadlinePassed =
    !!job.deadline && new Date(job.deadline).getTime() < currentTime;
  const pendingCaseType = pendingCaseTx?.type;

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

          {job.escrowConfirmed && !declined && (
            <Card title="Dispute and refund">
              {disputeCase ? (
                <>
                  <p className="status-line">
                    <span className="pill pill-amber">
                      <span className="dot" />
                      {disputeCase.type === "REFUND_REQUEST"
                        ? "Refund requested · Awaiting resolver review"
                        : "Dispute raised · Awaiting resolver review"}
                    </span>
                  </p>
                  <p className="quote">{disputeCase.reason}</p>
                  <p className="muted small">
                    Submitted by {disputeCase.requestedBy} ·{" "}
                    {formatDate(disputeCase.createdAt)}
                  </p>
                  {disputeCase.transactionHash && (
                    <p className="small">
                      <a
                        href={explorerTxUrl(disputeCase.transactionHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View NEAR transaction
                      </a>
                    </p>
                  )}
                  <p className="muted small">
                    This request records the case but does not move funds. Only
                    PayProof's configured dispute resolver can decide whether
                    funds are released or refunded.
                  </p>
                </>
              ) : projectDisputed ? (
                <p className="muted">
                  The escrow is disputed, but its case record could not be
                  loaded. {caseError || "Refresh the project or contact support."}
                </p>
              ) : projectCompleted ? (
                <p className="muted">
                  This project is complete. A dispute or refund request can no
                  longer be opened.
                </p>
              ) : (
                <>
                  <p className="card-lead">
                    Either project participant can raise a dispute while the
                    escrow is active. Only the client can request a refund, and
                    the refund option appears after the delivery deadline.
                    Requests are recorded on NEAR and in PayProof for later
                    resolver investigation; they do not automatically move
                    funds.
                  </p>
                  {caseError && (
                    <div className="form-error spaced-bottom" role="alert">
                      {caseError}
                    </div>
                  )}
                  <div className="field">
                    <label className="field-label" htmlFor="escrow-case-reason">
                      Reason for the case
                    </label>
                    <div className="field-control">
                      <textarea
                        id="escrow-case-reason"
                        rows={4}
                        maxLength={500}
                        value={caseReason}
                        onChange={(event) => {
                          setCaseReason(event.target.value);
                          setCaseError("");
                        }}
                        disabled={!!caseBusy || !!pendingCaseTx}
                        placeholder="Describe the issue and the outcome you are requesting."
                      />
                    </div>
                    <p className="muted small">
                      {caseReason.trim().length}/500 characters
                    </p>
                  </div>
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleEscrowCase("DISPUTE")}
                      disabled={!!caseBusy || (!!caseError && !pendingCaseTx) || (pendingCaseType && pendingCaseType !== "DISPUTE")}
                    >
                      {caseBusy === "DISPUTE"
                        ? "Submitting dispute..."
                        : pendingCaseType === "DISPUTE"
                          ? "Retry dispute logging"
                          : "Raise a dispute"}
                    </Button>
                    {isClient && deadlinePassed && (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleEscrowCase("REFUND_REQUEST")}
                        disabled={!!caseBusy || (!!caseError && !pendingCaseTx) || (pendingCaseType && pendingCaseType !== "REFUND_REQUEST")}
                      >
                        {caseBusy === "REFUND_REQUEST"
                          ? "Submitting request..."
                          : pendingCaseType === "REFUND_REQUEST"
                            ? "Retry refund logging"
                            : "Request a refund"}
                      </Button>
                    )}
                  </div>
                  {caseError && !isConnected && (
                    <p className="muted small spaced-top">
                      Connect and link your NEAR wallet before submitting a
                      dispute.{" "}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={connect}
                        disabled={walletLoading || !!walletBusy}
                      >
                        {walletBusy === "connect" ? "Connecting..." : "Connect wallet"}
                      </button>
                    </p>
                  )}
                  {!deadlinePassed && isClient && (
                    <p className="muted small spaced-top">
                      Refund requests become available after{" "}
                      {formatDate(job.deadline)}. You can raise a dispute before
                      then if there is another issue with the escrow.
                    </p>
                  )}
                  {pendingCaseTx && (
                    <p className="muted small spaced-top">
                      Transaction {pendingCaseTx.transactionHash} is saved.
                      Retry the same action to finish backend verification and
                      logging; do not sign another dispute transaction.
                    </p>
                  )}
                </>
              )}
              {caseError && disputeCase && (
                <div className="form-notice spaced-top" role="status">
                  {caseError}
                </div>
              )}
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