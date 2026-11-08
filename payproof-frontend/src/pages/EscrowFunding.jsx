
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CircleCheck,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import PageHeader from "../components/PageHeader.jsx";
import ProjectStepper from "../components/ProjectStepper.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import EscrowStatusBadge from "../components/EscrowStatusBadge.jsx";
import EscrowTransactionStatus from "../components/EscrowTransactionStatus.jsx";
import EscrowDetails from "../components/EscrowDetails.jsx";
import FundingChecklist from "../components/FundingChecklist.jsx";
import PreparedEscrowPanel from "../components/PreparedEscrowPanel.jsx";

import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";

import { getJob } from "../services/jobService.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
} from "../services/jobMapper.js";
import { calculatePlatformFee } from "../services/fees.js";

import {
  NETWORK_ID,
  NETWORK_LABEL,
  clearSavedTx,
  confirmEscrow,
  createEscrow,
  getEscrowForJob,
  normalizeEscrow,
  readSavedTx,
  saveTx,
} from "../services/escrowService.js";

import {
  normalizePreparation,
  signPreparedEscrow,
  validatePreparation,
} from "../services/escrowTransaction.js";

const BUSY_PHASES = [
  "preparing",
  "awaiting_wallet",
  "submitted",
  "verifying",
];

const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 4000;

const PREPARATION_TIMEOUT_MS = 30000;
const WALLET_TIMEOUT_MS = 120000;

const sleep = (ms) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

class StepTimeout extends Error {
  constructor(message) {
    super(message);
    this.name = "StepTimeout";
    this.isTimeout = true;
  }
}

function withTimeout(promise, ms, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(
        new StepTimeout(
          `${label} is taking longer than expected. Check the status before trying again.`
        )
      );
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function accountMatchesNetwork(accountId) {
  if (!accountId) return false;

  if (/^[0-9a-f]{64}$/i.test(accountId)) return true;

  return NETWORK_ID === "mainnet"
    ? accountId.endsWith(".near")
    : accountId.endsWith(".testnet");
}

/*
 * The backend sets escrowId and CONFIRMED only after
 * the on-chain transaction has been verified.
 *
 * Do not use escrowCreationId here: that field represents
 * a reservation and does not prove that funding succeeded.
 */
function isJobEscrowFunded(job) {
  if (!job) return false;

  const raw = job.raw ?? job;

  const creationStatus = String(
    job.escrowCreationStatus ??
      raw.escrowCreationStatus ??
      raw.escrow_creation_status ??
      ""
  ).toUpperCase();

  const confirmedEscrowId =
    job.escrowId ??
    raw.escrowId ??
    raw.escrow_id ??
    null;

  return creationStatus === "CONFIRMED" ||
    Boolean(confirmedEscrowId);
}

function getConfirmedEscrowId(job, escrow) {
  return (
    escrow?.escrowId ??
    job?.escrowId ??
    job?.raw?.escrowId ??
    job?.raw?.escrow_id ??
    null
  );
}

export default function EscrowFunding() {
  const { jobId } = useParams();
  const { user } = useAuth();

  const {
    address: walletAddress,
    isConnected,
    busy: walletBusy,
    loadError,
    lastCheck,
    connect,
    refresh: refreshLinkedWallet,
  } = useWallet();

  const isFreelancer = user?.role === "FREELANCER";

  const [job, setJob] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState("");

  const [phase, setPhase] = useState("idle");
  const [failureKind, setFailureKind] = useState("");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState(null);
  const [escrowId, setEscrowId] = useState(null);
  const [prepared, setPrepared] = useState(null);

  const [checking, setChecking] = useState(true);
  const [sessionAccount, setSessionAccount] = useState(undefined);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");

  const alive = useRef(true);
  const inFlight = useRef(false);
  const reconcileInFlight = useRef(false);
  const fundingAttemptId = useRef(0);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      fundingAttemptId.current += 1;
    };
  }, []);

  /* ---------------- wallet validation ---------------- */

  const readSession = useCallback(async () => {
    try {
      const near = await import("../services/nearWallet.js");
      const account = await near.getWalletSessionAccount();

      if (alive.current) {
        setSessionAccount(account);
      }
    } catch {
      if (alive.current) {
        setSessionAccount(null);
      }
    }
  }, []);

  const recheckWallet = useCallback(async () => {
    setChecking(true);
    setSessionError("");

    try {
      await Promise.all([
        refreshLinkedWallet(),
        readSession(),
      ]);
    } catch (err) {
      if (alive.current) {
        setSessionError(
          err.message || "Could not refresh wallet information."
        );
      }
    } finally {
      if (alive.current) {
        setChecking(false);
      }
    }
  }, [refreshLinkedWallet, readSession]);

  useEffect(() => {
    recheckWallet();
  }, [recheckWallet]);

  useEffect(() => {
    window.addEventListener("focus", readSession);

    return () => {
      window.removeEventListener("focus", readSession);
    };
  }, [readSession]);

  const reconnectSession = async (switchAccount) => {
    if (sessionBusy) return;

    setSessionBusy(true);
    setSessionError("");

    try {
      const near = await import("../services/nearWallet.js");

      const account = switchAccount
        ? await near.switchWalletAccount()
        : await near.ensureWalletSession();

      if (alive.current) {
        setSessionAccount(account);
      }
    } catch (err) {
      if (alive.current) {
        setSessionError(
          err.message || "Could not open your wallet."
        );
      }
    } finally {
      if (alive.current) {
        setSessionBusy(false);
      }
    }
  };

  /* ---------------- job loading ---------------- */

  const refreshJob = useCallback(async () => {
    try {
      const fresh = normalizeJob(await getJob(jobId));

      if (alive.current && fresh?.id) {
        setJob(fresh);
      }

      return fresh;
    } catch {
      return null;
    }
  }, [jobId]);

  /* ---------------- confirmation ---------------- */

  const markConfirmed = useCallback(
    (confirmed, fallbackJob = null) => {
      if (!alive.current) return;

      const confirmedId = getConfirmedEscrowId(
        fallbackJob,
        confirmed
      );

      const confirmedEscrow = {
        ...(confirmed ?? {}),
        escrowId: confirmedId,
        status: "Funded",
        isFunded: true,
      };

      setEscrow(confirmedEscrow);
      setEscrowId(confirmedId);
      setPrepared(null);
      setPhase("confirmed");
      setMessage("");
      setFailureKind("");

      clearSavedTx(jobId);

      refreshJob();
    },
    [jobId, refreshJob]
  );

  /*
   * Check both backend endpoints.
   * The job endpoint is authoritative for the persisted
   * escrowCreationStatus after confirmation.
   */
  const readBackendFundingStatus = useCallback(async () => {
    const [jobResult, escrowResult] = await Promise.allSettled([
      getJob(jobId),
      getEscrowForJob(jobId),
    ]);

    const latestJob =
      jobResult.status === "fulfilled"
        ? normalizeJob(jobResult.value)
        : null;

    const latestEscrow =
      escrowResult.status === "fulfilled"
        ? normalizeEscrow(escrowResult.value)
        : null;

    if (alive.current && latestJob?.id) {
      setJob(latestJob);
    }

    if (latestEscrow && alive.current) {
      setEscrow(latestEscrow);
    }

    const jobFunded = isJobEscrowFunded(latestJob);
    const escrowFunded = Boolean(latestEscrow?.isFunded);

    if (jobFunded || escrowFunded) {
      markConfirmed(latestEscrow, latestJob);
      return {
        funded: true,
        job: latestJob,
        escrow: latestEscrow,
      };
    }

    return {
      funded: false,
      job: latestJob,
      escrow: latestEscrow,
    };
  }, [jobId, markConfirmed]);

  const reconcile = useCallback(
    async ({ escrowId: id, hash }) => {
      if (reconcileInFlight.current) return false;

      reconcileInFlight.current = true;

      setPhase("verifying");
      setMessage(
        "Your transaction was submitted. PayProof is checking its on-chain status."
      );

      try {
        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
          if (!alive.current) return false;

          if (id && hash) {
            try {
              const result = await confirmEscrow({
                escrowId: id,
                jobId,
                transactionHash: hash,
              });

              const confirmed = normalizeEscrow(result);

              if (confirmed?.isFunded) {
                markConfirmed(confirmed);
                return true;
              }
            } catch (err) {
              const isStablecoin = ["USDT", "USDC"].includes(
                String(job?.currency).toUpperCase()
              );

              if (isStablecoin && err.status === 400) {
                setFailureKind("unknown");
                setMessage(
                  `Your ${job.currency} transfer was submitted, but PayProof could not confirm it as funded. Do not submit another transfer until this transaction is resolved.`
                );
                setPhase("unknown");
                return false;
              }

              if (err.status === 400 || err.status === 403) {
                setFailureKind("failed");
                setMessage(
                  err.message ||
                    "The transaction could not be verified."
                );
                setPhase("failed");
                return false;
              }

              if (err.status >= 500) {
                setMessage(
                  `${job?.currency || "NEAR"} funding verification is temporarily unavailable. Your transaction may still be processing.`
                );
              }
            }
          }

          try {
            const status = await readBackendFundingStatus();

            if (status.funded) {
              return true;
            }
          } catch {
            // Continue polling.
          }

          if (attempt < POLL_ATTEMPTS - 1) {
            await sleep(POLL_DELAY_MS);
          }
        }

        if (alive.current) {
          setPhase("unknown");
          setMessage(
            "Funding has not yet been confirmed. Do not submit another payment. Check the transaction status again shortly."
          );
        }

        return false;
      } finally {
        reconcileInFlight.current = false;
      }
    },
    [job?.currency, jobId, markConfirmed, readBackendFundingStatus]
  );

  /* ---------------- initial loading ---------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailure("");

    try {
      const [jobData, escrowData] = await Promise.all([
        getJob(jobId),
        getEscrowForJob(jobId).catch(() => null),
      ]);

      const normalizedJob = normalizeJob(jobData);

      const normalizedEscrow = escrowData
        ? normalizeEscrow(escrowData)
        : null;

      if (!normalizedJob?.id) {
        throw new Error(
          "The project response did not contain a valid project ID."
        );
      }

      if (!alive.current) return;

      setJob(normalizedJob);
      setEscrow(normalizedEscrow);

      if (normalizedEscrow?.escrowId) {
        setEscrowId(normalizedEscrow.escrowId);
      }

      /*
       * Check persisted job confirmation as well as
       * the escrow endpoint.
       */
      if (
        normalizedEscrow?.isFunded ||
        isJobEscrowFunded(normalizedJob)
      ) {
        markConfirmed(normalizedEscrow, normalizedJob);
        return;
      }

      const saved = readSavedTx(jobId);

      if (saved?.hash && saved?.escrowId) {
        setTxHash(saved.hash);
        setEscrowId(saved.escrowId);

        reconcile({
          escrowId: saved.escrowId,
          hash: saved.hash,
        });

        return;
      }

      if (
        saved?.prep &&
        saved?.escrowId &&
        (!saved.prep.jobId || saved.prep.jobId === jobId)
      ) {
        try {
          validatePreparation(saved.prep);
          setPrepared(saved.prep);
          setEscrowId(saved.escrowId);
          setPhase("ready");
        } catch (err) {
          console.warn(
            "[PayProof Funding] Discarding invalid saved preparation",
            err
          );
          clearSavedTx(jobId);
          setPrepared(null);
          setEscrowId(null);
          setFailureKind("request");
          setMessage(
            "Your saved funding details are outdated. Prepare a new escrow transaction before approving payment."
          );
          setPhase("idle");
        }
        return;
      }

      setPhase("idle");
    } catch (err) {
      if (alive.current) {
        setJob(null);
        setLoadFailure(
          err.message || "Could not load this escrow."
        );
      }
    } finally {
      if (alive.current) {
        setLoading(false);
      }
    }
  }, [jobId, markConfirmed, reconcile]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------------- step 1: prepare ---------------- */

  const prepareFunding = async () => {
    if (
      inFlight.current ||
      reconcileInFlight.current ||
      !alive.current
    ) {
      return;
    }

    if (prepared) {
      setMessage("");
      setFailureKind("");
      setPhase("ready");
      return;
    }

    inFlight.current = true;
    setMessage("");
    setFailureKind("");

    try {
      if (!walletAddress || !isConnected) {
        throw new Error(
          `Connect your NEAR wallet before funding with ${job.currency}.`
        );
      }

      if (!accountMatchesNetwork(walletAddress)) {
        throw new Error(
          `Your linked wallet is not a ${NETWORK_LABEL} account.`
        );
      }

      setPhase("preparing");
      setMessage("Preparing your escrow transaction...");

      console.info("[PayProof Funding] Preparing escrow", {
        jobId,
        walletAddress,
      });

      const prepData = await withTimeout(
        createEscrow(jobId),
        PREPARATION_TIMEOUT_MS,
        "Escrow preparation"
      );

      if (!alive.current) return;

      const prep = normalizePreparation(prepData);

      if (prep.jobId && prep.jobId !== jobId) {
        throw new Error(
          "The preparation belongs to a different project."
        );
      }

      validatePreparation(prep, walletAddress);

      setEscrowId(prep.escrowId);

      saveTx(jobId, {
        escrowId: prep.escrowId,
        hash: null,
        prep,
      });

      setPrepared(prep);
      setMessage("");
      setPhase("ready");

      console.info("[PayProof Funding] Escrow prepared", {
        escrowId: prep.escrowId,
        contractId: prep.contractId,
        methodName: prep.methodName,
        network: prep.network,
      });
    } catch (err) {
      if (!alive.current) return;

      if (err.status === 409) {
        inFlight.current = false;
        setPhase("idle");
        await load();

        if (alive.current && !readSavedTx(jobId)?.prep) {
          setFailureKind("request");
          setMessage(
            "A funding reservation already exists for this project, but its transaction details aren't saved in this browser."
          );
          setPhase("failed");
        }

        return;
      }

      setFailureKind(err.isTimeout ? "unknown" : err.kind || "request");
      setMessage(err.message || "Could not prepare escrow funding.");
      setPhase(err.isTimeout ? "unknown" : "failed");

      console.error(
        "[PayProof Funding] Funding preparation error",
        err
      );
    } finally {
      inFlight.current = false;
    }
  };

  /* ---------------- step 2: approve in wallet ---------------- */

  const approveInWallet = async () => {
    if (
      inFlight.current ||
      reconcileInFlight.current ||
      !prepared ||
      !alive.current
    ) {
      return;
    }

    inFlight.current = true;
    const attemptId = ++fundingAttemptId.current;

    const isCurrentAttempt = () =>
      alive.current &&
      fundingAttemptId.current === attemptId;

    setMessage("");
    setFailureKind("");
    setPhase("awaiting_wallet");

    console.info("[PayProof Funding] Wallet signing started", {
      escrowId: prepared.escrowId,
      contractId: prepared.contractId,
      methodName: prepared.methodName,
      network: prepared.network,
    });

    try {
      const result = await withTimeout(
        signPreparedEscrow(prepared, {
          expectedAccountId: walletAddress,
        }),
        WALLET_TIMEOUT_MS,
        "Wallet signing"
      );

      if (!isCurrentAttempt()) return;

      if (!result?.hash) {
        setPhase("unknown");
        setFailureKind("unknown");
        setMessage(
          `The wallet did not return a transaction hash. Check your NEAR wallet activity before trying another ${job.currency} payment.`
        );
        return;
      }

      setTxHash(result.hash);

      saveTx(jobId, {
        escrowId: prepared.escrowId,
        hash: result.hash,
        prep: prepared,
      });

      setPhase("submitted");
      setMessage(
        "Transaction submitted. Waiting for PayProof to verify it."
      );

      console.info("[PayProof Funding] Transaction submitted", {
        escrowId: prepared.escrowId,
        transactionHash: result.hash,
      });

      await reconcile({
        escrowId: prepared.escrowId,
        hash: result.hash,
      });
    } catch (err) {
      if (!isCurrentAttempt()) return;

      if (err.isTimeout) {
        setFailureKind("unknown");
        setPhase("unknown");
        setMessage(
          `The wallet did not respond within the expected time. The request may still be open. Check your NEAR wallet activity before attempting another ${job.currency} payment.`
        );

        console.warn(
          "[PayProof Funding] Wallet response timed out. Do not retry until wallet activity is checked.",
          err
        );

        return;
      }

      setFailureKind(err.kind || "failed");

      if (err.kind === "cancelled") {
        setMessage(
          "You cancelled the wallet request. Your prepared escrow is still available, so you can try again."
        );
      } else {
        setMessage(
          err.message ||
            "The wallet transaction could not be completed. Check wallet activity before retrying."
        );
      }

      setPhase("failed");

      console.error(
        "[PayProof Funding] Wallet transaction error",
        err
      );
    } finally {
      inFlight.current = false;
    }
  };

  /* ---------------- status checking ---------------- */

  const checkStatus = async () => {
    if (
      reconcileInFlight.current ||
      inFlight.current
    ) {
      return;
    }

    const saved = readSavedTx(jobId);

    const id = saved?.escrowId ?? escrowId;
    const hash = saved?.hash ?? txHash;

    if (hash && id) {
      await reconcile({
        escrowId: id,
        hash,
      });
      return;
    }

    try {
      setPhase("verifying");
      setMessage("Checking the escrow status...");

      const status = await readBackendFundingStatus();

      if (status.funded) {
        return;
      }

      setMessage(
        `The backend has not confirmed funding yet. Check your NEAR wallet activity before starting another ${job.currency} payment.`
      );
      setPhase("unknown");
    } catch (err) {
      setMessage(
        err.message || "Could not check escrow status."
      );
      setPhase("unknown");
    }
  };

  /* ---------------- retry ---------------- */

  const retry = () => {
    setMessage("");
    setFailureKind("");

    if (prepared) {
      setPhase("ready");
    } else {
      setPhase("idle");
    }
  };

  /* ---------------- render ---------------- */

  if (loading) {
    return <p className="muted">Loading escrow...</p>;
  }

  if (!job) {
    return (
      <>
        <PageHeader
          eyebrow="Escrow"
          title="Project not found"
        />
        {loadFailure && (
          <div className="form-error">
            {loadFailure}
          </div>
        )}
      </>
    );
  }

  const funded =
    phase === "confirmed" ||
    Boolean(escrow?.isFunded) ||
    isJobEscrowFunded(job);

  const busyNow = BUSY_PHASES.includes(phase);
  const readyToSign = phase === "ready" && !!prepared;

  const savedTx = readSavedTx(jobId);

  const pendingTx =
    phase === "unknown" || !!savedTx?.hash;

  const agreementApproved = job.stage >= 2;

  const reserved =
    !funded &&
    (!!prepared || !!escrow?.escrowId);

  const linked = isConnected && !!walletAddress;

  const networkOk =
    linked && accountMatchesNetwork(walletAddress);

  const checks = [];

  checks.push({
    id: "agreement",
    label: "Agreement approved",
    status: agreementApproved ? "ok" : "fail",
    detail: agreementApproved
      ? "Both parties approved the current version."
      : "Both parties must approve the agreement before funding opens.",
    action: agreementApproved
      ? null
      : {
          label: "Open agreement",
          to: `/agreements/${job.id}`,
        },
  });

  checks.push({
    id: "linked",
    label: "Wallet linked to PayProof",
    status: checking
      ? "pending"
      : linked
        ? "ok"
        : "fail",
    detail: checking
      ? "Checking your PayProof account..."
      : linked
        ? `Linked wallet: ${walletAddress}`
        : loadError
          ? `PayProof couldn't read your linked wallet: ${loadError}`
          : "No NEAR wallet is linked to your PayProof account yet.",
    action:
      checking || linked
        ? null
        : {
            label:
              walletBusy === "connect"
                ? "Connecting..."
                : "Connect wallet",
            onClick: connect,
            disabled: walletBusy === "connect",
          },
  });

  let sessionStatus = "blocked";
  let sessionDetail = "Link a wallet first.";
  let sessionAction = null;

  if (linked) {
    if (
      checking ||
      sessionAccount === undefined
    ) {
      sessionStatus = "pending";
      sessionDetail =
        "Checking your wallet session...";
    } else if (sessionAccount === null) {
      sessionStatus = "fail";
      sessionDetail =
        "Your wallet isn't signed in on this browser.";

      sessionAction = {
        label: sessionBusy
          ? "Opening wallet..."
          : "Sign in to wallet",
        onClick: () => reconnectSession(false),
        disabled: sessionBusy,
      };
    } else if (sessionAccount !== walletAddress) {
      sessionStatus = "fail";

      sessionDetail =
        `Signed in as ${sessionAccount}, but ${walletAddress} is the wallet linked to your account.`;

      sessionAction = {
        label: sessionBusy
          ? "Opening wallet..."
          : "Switch account",
        onClick: () => reconnectSession(true),
        disabled: sessionBusy,
      };
    } else {
      sessionStatus = "ok";
      sessionDetail =
        `Signed in as ${sessionAccount}.`;
    }
  }

  if (
    sessionError &&
    sessionStatus === "fail"
  ) {
    sessionDetail =
      `${sessionDetail} ${sessionError}`;
  }

  checks.push({
    id: "session",
    label: "Wallet matches the linked account",
    status: sessionStatus,
    detail: sessionDetail,
    action: sessionAction,
  });

  checks.push({
    id: "network",
    label: `Wallet is on ${NETWORK_LABEL}`,
    status: !linked
      ? "blocked"
      : networkOk
        ? "ok"
        : "fail",
    detail: !linked
      ? "Link a wallet first."
      : networkOk
        ? `${walletAddress} is a ${NETWORK_LABEL} account.`
        : `${walletAddress} is not a ${NETWORK_LABEL} account. Link a different wallet.`,
    action: null,
  });

  const walletReady =
    checks.every((check) => check.status === "ok");

  const canFund =
    !isFreelancer &&
    !funded &&
    walletReady &&
    !checking &&
    !busyNow &&
    !readyToSign &&
    !pendingTx;

  const platformFee = calculatePlatformFee(job.amount);
  const totalFundingAmount = Number(job.amount) + platformFee;

  const fundLabel = busyNow
    ? "Funding in progress..."
    : readyToSign
      ? "Ready to approve below"
      : reserved
        ? `Continue funding ${formatAmount(totalFundingAmount, job.currency)}`
        : `Fund ${formatAmount(totalFundingAmount, job.currency)}`;

  const stepperCurrent = funded
    ? Math.max(job.stage, 3)
    : Math.max(job.stage, 2);

  const title = isFreelancer
    ? funded
      ? "Your payment is in place."
      : "Waiting for the client to fund escrow."
    : funded
      ? "Escrow funded. Work can begin."
      : "Secure the payment. Start the work.";

  const subtitle = isFreelancer
    ? funded
      ? "The client funded the full project amount. You can now begin work under the approved agreement."
      : "You'll see confirmation here before work begins. Do not start work until funding is confirmed."
    : funded
      ? "Your deposit is held until you approve the delivery or a settlement is resolved."
      : `Both parties approved the agreement. Fund escrow with ${job.currency} from your NEAR wallet to give your freelancer the go-ahead.`;

  return (
    <>
      <PageHeader
        eyebrow={`${job.title} / Escrow · ${formatDate(job.createdAt)}`}
        title={title}
        subtitle={subtitle}
      />

      <ProjectStepper current={stepperCurrent} jobId={job.id} />

      <div className="project-grid">
        <div className="stack">
          <Card title="Project escrow">
            <div className="kv">
              <span>Status</span>

              {funded ? (
                <EscrowStatusBadge status="Funded" />
              ) : (
                <span className="pill pill-amber">
                  <span className="dot" />
                  {agreementApproved
                    ? "Awaiting client funding"
                    : "Agreement pending"}
                </span>
              )}
            </div>

            <div className="escrow-amount">
              {formatAmount(
                job.amount,
                job.currency
              )}
            </div>

            <div className="kv">
              <span>Client</span>
              <strong>{job.client || "—"}</strong>
            </div>

            <div className="kv">
              <span>Freelancer</span>
              <strong>{job.freelancer || "—"}</strong>
            </div>

            <div className="kv">
              <span>Agreement</span>
              <strong>
                {agreementApproved
                  ? "Both approved"
                  : "Not yet approved"}
              </strong>
            </div>
          </Card>

          <EscrowTransactionStatus
            phase={phase}
            failureKind={failureKind}
            message={message}
            txHash={txHash}
            escrowId={escrowId}
            onRetry={retry}
            onCheck={checkStatus}
          />

          {readyToSign && !isFreelancer && (
            <PreparedEscrowPanel
              prep={prepared}
              job={job}
              walletAddress={walletAddress}
              busy={busyNow}
              onApprove={approveInWallet}
              onCancel={() => setPhase("idle")}
            />
          )}

          {!isFreelancer && !funded && (
            <Card title="Review your funding">
              <div className="kv">
                <span>Project amount</span>
                <strong>
                  {formatAmount(
                    job.amount,
                    job.currency
                  )}
                </strong>
              </div>

              <div className="kv">
                <span>Client platform fee · 3.5%</span>
                <strong>
                  {formatAmount(platformFee, job.currency)}
                </strong>
              </div>

              <div className="kv">
                <span>Total charged</span>
                <strong>
                  {formatAmount(totalFundingAmount, job.currency)}
                </strong>
              </div>

              <div className="kv">
                <span>Network</span>
                <strong>{NETWORK_LABEL}</strong>
              </div>

              <div className="kv">
                <span>Payment wallet</span>
                {linked ? (
                  <strong className="mono">
                    {walletAddress}
                  </strong>
                ) : (
                  <span className="muted">
                    Not linked
                  </span>
                )}
              </div>

              {reserved && (
                <div className="callout callout-warn spaced-top">
                  A funding reservation already exists for this project
                  {(prepared?.escrowId || escrow?.escrowId)
                    ? ` (${prepared?.escrowId || escrow?.escrowId})`
                    : ""}.
                  Continue with the existing reservation. No new escrow
                  will be created.
                </div>
              )}

              {pendingTx && (
                <div className="callout callout-warn spaced-top">
                  A transaction may already have been submitted. Check its
                  status before attempting another payment.
                </div>
              )}

              <FundingChecklist items={checks} />

              {import.meta.env.DEV && lastCheck && (
                <details className="wallet-debug">
                  <summary>
                    Wallet diagnostics (dev only)
                  </summary>
                  <pre>
                    {JSON.stringify(lastCheck, null, 2)}
                  </pre>
                </details>
              )}

              <div className="action-row spaced-top">
                <Button
                  variant="secondary"
                  icon={RefreshCw}
                  onClick={recheckWallet}
                  disabled={checking || busyNow}
                >
                  {checking
                    ? "Checking..."
                    : "Re-check"}
                </Button>

                <Button
                  icon={Wallet}
                  onClick={prepareFunding}
                  disabled={!canFund}
                >
                  {fundLabel}
                </Button>
              </div>

              <p className="muted small spaced-top">
                {walletReady
                  ? `Funding takes two steps: PayProof prepares your escrow, then you approve the ${job.currency} transfer in your NEAR wallet. Work begins only after PayProof verifies it on-chain.`
                  : "Complete the checks above to enable funding."}
              </p>
            </Card>
          )}

          {isFreelancer && !funded && (
            <Card title="Release status">
              <p className="muted">
                Awaiting client funding. Once the client funds escrow and
                PayProof verifies the transaction, your payment is protected
                and you can begin work.
              </p>
            </Card>
          )}

          {funded && (
            <EscrowDetails
              job={job}
              escrow={escrow}
              txHash={txHash}
            />
          )}
        </div>

        <aside className="stack">
          <Card title="Project snapshot">
            <h3 className="snapshot-title">
              {job.title}
            </h3>

            <p className="muted small">
              {funded
                ? "Funded · Work may begin"
                : "Approved agreement · Ready to fund"}
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
              <strong>
                {formatAmount(
                  job.amount,
                  job.currency
                )}
              </strong>
            </div>

            <div className="kv">
              <span>Delivery</span>
              <strong>{formatDate(job.deadline)}</strong>
            </div>

            <p className="muted small spaced-top">
              {job.id} · Created {formatDate(job.createdAt)}
            </p>
          </Card>

          <Card title="Protected by design">
            <ul className="next-list">
              <li>
                <CircleCheck size={22} />
                <div>
                  <strong>No early payment release</strong>
                </div>
              </li>

              <li>
                <CircleCheck size={22} />
                <div>
                  <strong>Every transaction recorded</strong>
                </div>
              </li>

              <li>
                <CircleCheck size={22} />
                <div>
                  <strong>Funding verified on-chain</strong>
                </div>
              </li>
            </ul>
          </Card>

          <div className="callout callout-row">
            <ShieldCheck size={22} />

            <div>
              <strong>
                {isFreelancer
                  ? "No deposit needed from you"
                  : "Only you fund this escrow"}
              </strong>

              <p>
                {isFreelancer
                  ? "The client pays the full project amount. Nothing is deducted from your earnings."
                  : "Your freelancer never needs to send funds. Your deposit is held until you approve delivery."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
