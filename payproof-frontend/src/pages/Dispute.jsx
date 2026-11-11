import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import DisputeProposalPanel from "../components/DisputeProposalPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { getJob } from "../services/jobService.js";
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

export default function Dispute() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const { address, isConnected, loading: walletLoading, busy: walletBusy, connect } = useWallet();
  const isClient = user?.role === "CLIENT";

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disputeCase, setDisputeCase] = useState(null);
  const [caseError, setCaseError] = useState("");
  const [caseReason, setCaseReason] = useState("");
  const [caseBusy, setCaseBusy] = useState("");
  const [pendingCaseTx, setPendingCaseTx] = useState(() => readPendingCaseTx(jobId));
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [splitSeen, setSplitSeen] = useState(false);
  const splitRefreshed = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
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
    setSplitSeen(false);
    splitRefreshed.current = false;
  }, [jobId]);

  // Keep the split panel on screen after the project leaves DISPUTED (for the settled banner).
  useEffect(() => {
    if (String(job?.raw?.status || "").toUpperCase() === "DISPUTED") {
      setSplitSeen(true);
    }
  }, [job]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Runs once when the escrow reaches Released, so the project status refreshes without a flicker.
  const handleSplitSettled = useCallback(() => {
    if (splitRefreshed.current) return;
    splitRefreshed.current = true;
    load({ silent: true });
  }, [load]);

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
      await load({ silent: true });
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

  if (loading) return <p className="muted">Loading dispute...</p>;

  if (!job) {
    return (
      <>
        <PageHeader eyebrow="Projects" title="Project not found" />
        {error && <div className="form-error">{error}</div>}
      </>
    );
  }

  const declined = job.invitation === "declined";
  const projectStatus = String(job.raw?.status || "").toUpperCase();
  const projectCompleted = ["COMPLETED", "CANCELLED"].includes(projectStatus);
  const projectDisputed = projectStatus === "DISPUTED";
  const deadlinePassed =
    !!job.deadline && new Date(job.deadline).getTime() < currentTime;
  const pendingCaseType = pendingCaseTx?.type;
  const escrowReady = job.escrowConfirmed && !declined;

  return (
    <>
      <PageHeader
        eyebrow={`Projects / ${job.title} / Dispute`}
        title="Dispute & refund"
        subtitle="Raise a case, review the resolver's proposed split and respond from your NEAR wallet."
      />

      <p className="spaced-bottom">
        <Link to={`/projects/${job.id}`} className="btn btn-secondary">
          <ArrowLeft size={16} />
          Back to project
        </Link>
      </p>

      {error && <div className="form-error spaced">{error}</div>}

      <div className="project-grid">
        <div className="stack">
          <Card title="Case">
            {!escrowReady ? (
              <p className="muted">
                Disputes and refunds are available once the escrow is funded and
                confirmed for this project.
              </p>
            ) : disputeCase ? (
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
                loaded. {caseError || "Refresh the page or contact support."}
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

          {escrowReady && (projectDisputed || splitSeen) && (
            <DisputeProposalPanel job={job} onSettled={handleSplitSettled} />
          )}
        </div>

        <aside className="stack">
          <Card title="Case summary">
            <h3 className="snapshot-title">{job.title}</h3>
            <p className="muted small">{prettyStatus(job.statusText)}</p>

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
        </aside>
      </div>
    </>
  );
}