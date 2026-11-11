import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Wallet } from "lucide-react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { formatDate } from "../services/jobMapper.js";
import { explorerTxUrl, getEscrowForJob } from "../services/escrowService.js";
import {
  confirmSplitAction,
  formatRaw,
  getDisputeProposal,
} from "../services/disputeProposalService.js";
import { signSplitAction } from "../services/nearDisputeActions.js";
import "../css/dispute-proposal.css";

const LOCKED = ["releasing", "released", "refunding", "refunded"];
const DONE = ["released", "refunded"];

const pendingKey = (jobId) => `payproof_split_tx_${jobId}`;

function readPending(jobId) {
  try {
    const raw = sessionStorage.getItem(pendingKey(jobId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePending(jobId, tx) {
  try {
    sessionStorage.setItem(pendingKey(jobId), JSON.stringify(tx));
  } catch {
    /* storage unavailable */
  }
}

function clearPending(jobId) {
  try {
    sessionStorage.removeItem(pendingKey(jobId));
  } catch {
    /* storage unavailable */
  }
}

const HISTORY_LABELS = {
  ACCEPTED: "accepted the proposal",
  REJECTED: "rejected the proposal",
  REVOKED: "revoked their acceptance",
};

const DONE_MESSAGES = {
  accept: "Your acceptance is recorded.",
  reject: "Proposal rejected. The resolver can propose a new split.",
  revoke: "Your acceptance was revoked.",
};

function friendlyError(err) {
  const text = String(err?.message || err || "");
  if (/not enough|insufficient|balance|exceeds/i.test(text)) {
    return "You need a small amount of NEAR for gas fees.";
  }
  if (err?.status === 503) {
    return "The NEAR network is busy. Try again in a moment.";
  }
  return text || "Something went wrong. Please try again.";
}

const isCancelled = (err) =>
  /reject|cancel|denied|declin|closed|dismiss/i.test(String(err?.message || err || ""));

export default function DisputeProposalPanel({ job, onSettled }) {
  const jobId = job.id;
  const asset = String(job.currency || "NEAR").toUpperCase();
  const {
    address,
    isConnected,
    loading: walletLoading,
    busy: walletBusy,
    connect,
  } = useWallet();

  const [proposal, setProposal] = useState(undefined);
  const [escrowKey, setEscrowKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingTx, setPendingTx] = useState(() => readPending(jobId));
  const settledFired = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [next, escrow] = await Promise.all([
        getDisputeProposal(jobId),
        getEscrowForJob(jobId).catch(() => null),
      ]);
      setProposal(next || null);
      if (escrow) setEscrowKey(escrow.statusKey);
      setLoadError("");
    } catch (err) {
      if (err.status === 403) {
        setHidden(true);
        return;
      }
      setLoadError(err.message || "Could not load the dispute proposal.");
      setProposal((current) => (current === undefined ? null : current));
    }
  }, [jobId]);

  const done = DONE.includes(escrowKey);
  const hasProposal = !!proposal;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (done) return undefined;
    const timer = window.setInterval(refresh, hasProposal ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [done, hasProposal, refresh]);

  useEffect(() => {
    if (escrowKey === "released" && !settledFired.current) {
      settledFired.current = true;
      onSettled?.();
    }
  }, [escrowKey, onSettled]);

  const runAction = async (action, reasonOverride) => {
    setError("");
    setNotice("");

    const reason = action === "reject" ? (reasonOverride ?? rejectReason).trim() : "";

    if (action === "reject" && (reason.length < 10 || reason.length > 500)) {
      setError("Give a reason of 10 to 500 characters.");
      return;
    }
    if (walletLoading) {
      setError("Please wait while we check your linked wallet.");
      return;
    }
    if (!isConnected || !address) {
      setError("Connect and link your NEAR wallet to continue.");
      return;
    }

    let tx = pendingTx;

    if (tx && (tx.action !== action || (action === "reject" && tx.reason !== reason))) {
      setError(
        "A signed transaction is waiting for PayProof to verify it. Retry that one before starting another action."
      );
      return;
    }

    setBusy(action);

    try {
      if (!tx) {
        const transactionHash = await signSplitAction(action, proposal.escrowId, reason, address);
        tx = { action, reason, transactionHash };
        setPendingTx(tx);
        savePending(jobId, tx);
      }

      await confirmSplitAction(jobId, tx);

      clearPending(jobId);
      setPendingTx(null);
      setRejectOpen(false);
      setRejectReason("");
      setNotice(DONE_MESSAGES[action]);
      await refresh();
    } catch (err) {
      if (tx) {
        setError(
          `NEAR recorded transaction ${tx.transactionHash}, but PayProof could not verify it yet. Retry the same action. Do not sign again. ${friendlyError(err)}`
        );
      } else if (!isCancelled(err)) {
        setError(friendlyError(err));
      }
    } finally {
      setBusy("");
    }
  };

  const discardPending = () => {
    clearPending(jobId);
    setPendingTx(null);
    setError("");
  };

  if (hidden) return null;

  const locked = LOCKED.includes(escrowKey);
  const disabled = !!busy || walletLoading || !isConnected;

  return (
    <Card title="Dispute resolution proposal">
      {loadError && (
        <div className="form-error spaced-bottom" role="alert">
          {loadError}
        </div>
      )}
      {error && (
        <div className="form-error spaced-bottom" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="form-notice spaced-bottom" role="status">
          {notice}
        </div>
      )}

      {pendingTx && (
        <div className="form-notice spaced-bottom">
          <p className="small">
            A signed transaction ({pendingTx.action}) is saved and still needs backend verification.{" "}
            <a href={explorerTxUrl(pendingTx.transactionHash)} target="_blank" rel="noopener noreferrer">
              View on NEAR
            </a>
          </p>
          <div className="action-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => runAction(pendingTx.action, pendingTx.reason)}
              disabled={disabled}
            >
              {busy ? "Verifying..." : "Retry verification"}
            </Button>
            <button type="button" className="split-link" onClick={discardPending} disabled={!!busy}>
              Discard saved transaction
            </button>
          </div>
        </div>
      )}

      {escrowKey === "releasing" && (
        <div className="split-banner split-banner-amber">Settling on-chain...</div>
      )}
      {escrowKey === "released" && (
        <div className="split-banner split-banner-green">Dispute resolved. Both payments sent.</div>
      )}
      {escrowKey === "settlementfailed" && (
        <div className="split-banner split-banner-amber">
          Settlement failed. Our team is retrying it automatically.
        </div>
      )}

      {proposal === undefined && <p className="muted">Loading proposal...</p>}

      {proposal === null && !done && (
        <p className="muted">
          No active proposal. The resolver will propose a split after reviewing the case, and it
          will appear here.
        </p>
      )}

      {proposal && (
        <>
          <p className="muted small">
            You are the {proposal.myRole === "CLIENT" ? "client" : "freelancer"} on this project.
          </p>

          <div className="split-grid">
            <div className={`split-tile${proposal.myRole === "FREELANCER" ? " is-you" : ""}`}>
              <small>Freelancer receives</small>
              <strong>
                {formatRaw(proposal.freelancerAmountYocto, asset)} {asset}
              </strong>
            </div>
            <div className={`split-tile${proposal.myRole === "CLIENT" ? " is-you" : ""}`}>
              <small>Client refunded</small>
              <strong>
                {formatRaw(proposal.clientAmountYocto, asset)} {asset}
              </strong>
            </div>
            <div className="split-tile">
              <small>Platform fee</small>
              <strong>
                {formatRaw(proposal.feeYocto, asset)} {asset}
              </strong>
            </div>
          </div>
          <p className="muted small">The platform fee is taken from the freelancer's share.</p>

          <p className="quote">{proposal.reason}</p>

          <div className="split-flags">
            <span className={`split-flag${proposal.freelancerAccepted ? " yes" : ""}`}>
              {proposal.freelancerAccepted ? <Check size={16} /> : <Clock size={16} />}
              Freelancer {proposal.freelancerAccepted ? "accepted" : "pending"}
            </span>
            <span className={`split-flag${proposal.clientAccepted ? " yes" : ""}`}>
              {proposal.clientAccepted ? <Check size={16} /> : <Clock size={16} />}
              Client {proposal.clientAccepted ? "accepted" : "pending"}
            </span>
          </div>

          {Array.isArray(proposal.history) && proposal.history.length > 0 && (
            <ul className="split-history">
              {proposal.history.map((entry) => (
                <li key={entry.transactionHash}>
                  <strong>{entry.actorRole === "CLIENT" ? "Client" : "Freelancer"}</strong>{" "}
                  {HISTORY_LABELS[entry.actionType] || entry.actionType.toLowerCase()}
                  {entry.reason ? `: "${entry.reason}"` : ""}
                  <span className="muted small"> · {formatDate(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          {!locked && (
            <>
              {rejectOpen && proposal.canReject && (
                <div className="field spaced-top">
                  <label className="field-label" htmlFor="split-reject-reason">
                    Why are you rejecting this proposal?
                  </label>
                  <div className="field-control">
                    <textarea
                      id="split-reject-reason"
                      rows={3}
                      maxLength={500}
                      value={rejectReason}
                      onChange={(event) => {
                        setRejectReason(event.target.value);
                        setError("");
                      }}
                      disabled={!!busy}
                    />
                  </div>
                  <p className="muted small">
                    {rejectReason.trim().length}/500 characters. Rejecting clears the current
                    proposal and cannot be undone. The resolver may propose a new one.
                  </p>
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => runAction("reject")}
                      disabled={disabled || rejectReason.trim().length < 10}
                    >
                      {busy === "reject" ? "Rejecting..." : "Confirm rejection"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setRejectOpen(false)}
                      disabled={!!busy}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {!rejectOpen && (
                <div className="action-row spaced-top">
                  {proposal.canAccept && (
                    <Button
                      type="button"
                      onClick={() => runAction("accept")}
                      disabled={disabled || (!!pendingTx && pendingTx.action !== "accept")}
                    >
                      {busy === "accept" ? "Accepting..." : "Accept proposal"}
                    </Button>
                  )}
                  {proposal.canReject && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setRejectOpen(true)}
                      disabled={disabled || !!pendingTx}
                    >
                      Reject proposal
                    </Button>
                  )}
                  {proposal.canRevoke && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => runAction("revoke")}
                      disabled={disabled || (!!pendingTx && pendingTx.action !== "revoke")}
                    >
                      {busy === "revoke" ? "Revoking..." : "Revoke my acceptance"}
                    </Button>
                  )}
                  {!proposal.canAccept && !proposal.canReject && !proposal.canRevoke && (
                    <span className="muted">Waiting for the other party...</span>
                  )}
                </div>
              )}

              {(proposal.canAccept || proposal.canReject || proposal.canRevoke) && (
                <p className="muted small spaced-top">
                  Each action is signed in your NEAR wallet and costs about 0.002 NEAR in gas.
                </p>
              )}

              {!isConnected && !walletLoading && (
                <div className="split-connect spaced-top">
                  <p>Connect your NEAR wallet to accept or reject this proposal.</p>
                  <Button
                    type="button"
                    icon={Wallet}
                    variant="secondary"
                    onClick={connect}
                    disabled={!!walletBusy}
                  >
                    {walletBusy === "connect" ? "Connecting..." : "Connect wallet"}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}