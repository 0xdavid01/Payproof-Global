import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowUpRight, CircleCheck, FileText, Send, X } from "lucide-react";
import "../css/submission.css";
import PageHeader from "../components/PageHeader.jsx";
import ProjectStepper from "../components/ProjectStepper.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import TextField from "../components/TextField.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { getJob, updateChecklistProgress } from "../services/jobService.js";
import {
  getSubmissions,
  reviewSubmission,
  submitWork,
} from "../services/submissionService.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
  toList,
} from "../services/jobMapper.js";

const MAX_FILE_MB = 25;
const MAX_NOTES = 5000;
const MAX_EVIDENCE_LENGTH = 10000;

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// The submit response is a raw backend entity, so only read the fields we trust.
function readSubmission(data) {
  const s = data && typeof data === "object" ? data : {};

  return {
    id: s.id ?? null,
    versionNumber: s.versionNumber ?? null,
    status: s.status ?? null,
    fileName: s.fileName ?? null,
    fileSizeBytes: s.fileSizeBytes ?? null,
    externalUrl: s.externalUrl ?? null,
    notes: s.notes ?? null,
    submittedAt: s.submittedAt ?? s.createdAt ?? null,
  };
}

function buildWorkEvidence({ externalUrl, notes, fileName }) {
  const evidence =
    externalUrl?.trim() ||
    notes?.trim() ||
    (fileName ? `Deliverable file: ${fileName}` : "");

  if (!evidence) {
    throw new Error("Add a delivery link, notes, or a file before submitting work.");
  }
  if (evidence.length > MAX_EVIDENCE_LENGTH) {
    throw new Error(
      `The delivery evidence must be ${MAX_EVIDENCE_LENGTH.toLocaleString()} characters or fewer.`
    );
  }

  return evidence;
}

function workTransactionKey(jobId) {
  return `payproof_work_submission_${jobId}`;
}

function readWorkTransaction(jobId, escrowId) {
  try {
    const raw = sessionStorage.getItem(workTransactionKey(jobId));
    if (!raw) return null;

    const saved = JSON.parse(raw);
    return saved?.escrowId === escrowId ? saved : null;
  } catch (storageError) {
    console.warn("[PayProof] Could not restore the NEAR submission transaction:", storageError);
    return null;
  }
}

function saveWorkTransaction(jobId, transaction) {
  try {
    sessionStorage.setItem(workTransactionKey(jobId), JSON.stringify(transaction));
  } catch (storageError) {
    console.warn("[PayProof] Could not persist the NEAR submission transaction:", storageError);
  }
}

function releaseTransactionKey(jobId) {
  return `payproof_release_tx_${jobId}`;
}

function readReleaseTransaction(jobId) {
  try {
    const raw = sessionStorage.getItem(releaseTransactionKey(jobId));
    return raw ? JSON.parse(raw) : null;
  } catch (storageError) {
    console.warn("[PayProof] Could not restore the NEAR release transaction:", storageError);
    return null;
  }
}

function saveReleaseTransaction(jobId, transaction) {
  try {
    sessionStorage.setItem(releaseTransactionKey(jobId), JSON.stringify(transaction));
  } catch (storageError) {
    console.warn("[PayProof] Could not persist the NEAR release transaction:", storageError);
  }
}

function clearReleaseTransaction(jobId) {
  try {
    sessionStorage.removeItem(releaseTransactionKey(jobId));
  } catch (storageError) {
    console.warn("[PayProof] Could not clear the NEAR release transaction:", storageError);
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function saveAcceptedReview(jobId, versionId, payload) {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await reviewSubmission(jobId, versionId, payload);
    } catch (error) {
      if (error.status !== 503 || attempt === maxAttempts) {
        throw error;
      }

      await delay(3000);
    }
  }

  throw new Error("Could not verify the payout on NEAR.");
}

export default function SubmitWork() {
  const { jobId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { address, isConnected, loading: walletLoading, busy: walletBusy, connect } = useWallet();
  const isFreelancer = user?.role === "FREELANCER";
  const isClient = user?.role === "CLIENT";

  const [job, setJob] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [file, setFile] = useState(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [walletSwitching, setWalletSwitching] = useState(false);
  const [result, setResult] = useState(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewedRequirementPositions, setReviewedRequirementPositions] = useState([]);
  const [releaseTransaction, setReleaseTransaction] = useState(null);
  const [checkingPayout, setCheckingPayout] = useState(false);
  const [workTransaction, setWorkTransaction] = useState(null);

  const submitting = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setReleaseTransaction(readReleaseTransaction(jobId));
  }, [jobId]);

  useEffect(() => {
    if (location.hash !== "#release" || loading) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById("release")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, loading, submissions]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError("");

    getJob(jobId)
      .then(async (data) => {
        if (cancelled) return;

        const normalized = normalizeJob(data);

        if (!normalized?.id) {
          throw new Error("The project response did not contain a valid project ID.");
        }

        setJob(normalized);
        setWorkTransaction(readWorkTransaction(jobId, normalized.escrowId));

        if (isClient || isFreelancer) {
          try {
            const submissionData = await getSubmissions(jobId);
            if (!cancelled) {
              const loadedSubmissions = toList(submissionData);
              setSubmissions(loadedSubmissions);
              const activeSubmission = loadedSubmissions.find((submission) =>
                ["SUBMITTED", "UNDER_REVIEW"].includes(
                  String(submission.status || "").toUpperCase()
                )
              );
              setReviewedRequirementPositions(
                activeSubmission
                  ? normalized.requirements
                      .filter((requirement) => requirement.isDone)
                      .map((requirement) => requirement.requirementIndex)
                  : []
              );
            }
          } catch (err) {
            if (!cancelled) {
              setLoadError(err.message || "Could not load the project submissions.");
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setJob(null);
          setLoadError(err.message || "Could not load this project.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isClient, isFreelancer, jobId]);

  const pickFile = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = "";

    if (!picked) return;

    if (picked.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      setFileError(`That file is larger than ${MAX_FILE_MB} MB.`);
      return;
    }

    setFileError("");
    setFile(picked);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting.current) return;

    setError("");

    const url = externalUrl.trim();

    if (!file && !url) {
      setError("Upload a file or add a delivery link.");
      return;
    }

    if (url && !isHttpUrl(url)) {
      setError("The delivery link must start with http:// or https://.");
      return;
    }

    if (url.length > MAX_EVIDENCE_LENGTH) {
      setError(
        `The delivery link must be ${MAX_EVIDENCE_LENGTH.toLocaleString()} characters or fewer.`
      );
      return;
    }

    if (notes.length > MAX_NOTES) {
      setError(`Notes can be up to ${MAX_NOTES} characters.`);
      return;
    }

    let evidence;
    try {
      evidence = buildWorkEvidence({
        externalUrl: url,
        notes: notes.trim(),
        fileName: file?.name,
      });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    if (walletLoading) {
      setError("Please wait while we check your linked wallet.");
      return;
    }

    if (!isConnected || !address) {
      setError("Connect and link your freelancer NEAR wallet before submitting work.");
      return;
    }

    if (!job?.escrowId) {
      setError("This project does not have a valid escrow ID.");
      return;
    }

    submitting.current = true;
    setBusy(true);
    let savedSubmission = null;
    let blockchainSubmissionComplete = false;

    try {
      const { ensureWalletSessionMatches, submitWorkOnChain } = await import(
        "../services/nearWallet.js"
      );
      await ensureWalletSessionMatches(address);

      let completedTransaction = workTransaction;
      const transactionMatches =
        completedTransaction?.escrowId === job.escrowId &&
        completedTransaction?.accountId === address &&
        !completedTransaction?.submissionId;

      if (transactionMatches && completedTransaction.evidence !== evidence) {
        throw new Error(
          "NEAR has already recorded different delivery evidence for this escrow. Retry with the original delivery details or contact support."
        );
      }

      if (!transactionMatches) {
        const transactionHash = await submitWorkOnChain(
          job.escrowId,
          evidence,
          address
        );
        completedTransaction = {
          escrowId: job.escrowId,
          accountId: address,
          evidence,
          hash: transactionHash,
        };
        saveWorkTransaction(jobId, completedTransaction);
        blockchainSubmissionComplete = true;
      } else {
        blockchainSubmissionComplete = true;
      }

      setWorkTransaction(completedTransaction);

      const created = await submitWork(jobId, {
        file,
        externalUrl: url,
        notes: notes.trim(),
      });

      savedSubmission = readSubmission(created);
      completedTransaction = {
        ...completedTransaction,
        submissionId: savedSubmission.id,
      };
      setResult(savedSubmission);
      saveWorkTransaction(jobId, completedTransaction);
      setWorkTransaction(completedTransaction);
      try {
        setSubmissions(toList(await getSubmissions(jobId)));
      } catch (historyError) {
        setLoadError(
          `Your work was submitted, but the version history could not be refreshed: ${
            historyError.message || "Please reload the page."
          }`
        );
      }
    } catch (err) {
      if (blockchainSubmissionComplete && !savedSubmission) {
        setError(
          `The escrow is marked as work submitted on NEAR, but the delivery could not be saved: ${
            err.message || "Please retry the submission."
          } Retrying will reuse the existing NEAR transaction.`
        );
      } else if (err.status === 500) {
        setError(
          `The server returned an error while saving your delivery: ${
            err.message || "Please check your submission history before trying again."
          }`
        );
      } else if (err.status === 413) {
        setError("The server rejected the file because it is too large.");
      } else {
        setError(err.message || "Could not submit your work. Please try again.");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const handleSwitchToFreelancerWallet = async () => {
    if (!address || walletSwitching) return;

    setError("");
    setWalletSwitching(true);
    try {
      const { switchWalletSessionTo } = await import("../services/nearWallet.js");
      const accountId = await switchWalletSessionTo(address);
      setReviewNotice(`Connected NEAR account ${accountId}. You can retry the on-chain submission now.`);
    } catch (switchError) {
      setError(switchError.message || "Could not switch to your linked freelancer NEAR wallet.");
    } finally {
      setWalletSwitching(false);
    }
  };

  const reviewableSubmission = submissions.find((submission) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(
      String(submission.status || "").toUpperCase()
    )
  );
  const submittedRequirements = reviewableSubmission?.requirements || [];
  const allSubmittedRequirementsReviewed =
    submittedRequirements.length > 0 &&
    submittedRequirements.every((requirement) =>
      reviewedRequirementPositions.includes(requirement.requirementPosition)
    );
  const checkedRequirementCount = submittedRequirements.filter((requirement) =>
    reviewedRequirementPositions.includes(requirement.requirementPosition)
  ).length;

  const handleCheckAllRequirements = async () => {
    if (
      !isClient ||
      !reviewableSubmission ||
      reviewBusy ||
      allSubmittedRequirementsReviewed
    ) {
      return;
    }

    const currentRequirements = job?.requirements || [];
    const positions = submittedRequirements.map(({ requirementPosition }) =>
      Number(requirementPosition)
    );

    if (
      positions.some(
        (position) =>
          !Number.isInteger(position) ||
          position < 0 ||
          position >= currentRequirements.length
      )
    ) {
      setError("Some requirements are no longer available in the project checklist.");
      return;
    }

    const previousPositions = reviewedRequirementPositions;
    const selectedPositions = new Set(positions);
    const updatedRequirements = currentRequirements.map((requirement, index) => ({
      ...requirement,
      isDone: selectedPositions.has(index),
    }));

    setError("");
    setReviewedRequirementPositions(positions);
    setJob((current) => ({ ...current, requirements: updatedRequirements }));
    setReviewBusy(true);

    try {
      const progressResponse = await updateChecklistProgress(
        jobId,
        updatedRequirements.map(({ isDone, condition }) => ({
          isDone: Boolean(isDone),
          condition,
        }))
      );
      const updatedJob = normalizeJob(progressResponse);

      if (updatedJob?.id) setJob(updatedJob);

      try {
        await reviewSubmission(jobId, reviewableSubmission.id, {
          status: "PENDING",
          requirements: submittedRequirements.map(
            ({ requirementPosition }) => ({
              requirementPosition,
              status: "ACCEPTED",
            })
          ),
        });
      } catch (reviewError) {
        setError(
          `Checklist progress was saved, but the submission review could not be saved: ${
            reviewError.message || "Please try again."
          }`
        );
        return;
      }

      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === reviewableSubmission.id
            ? {
                ...submission,
                requirements: submission.requirements.map((requirement) => ({
                  ...requirement,
                  reviewStatus: "ACCEPTED",
                })),
              }
            : submission
        )
      );
    } catch (err) {
      setReviewedRequirementPositions(previousPositions);
      setJob((current) => ({ ...current, requirements: currentRequirements }));
      setError(err.message || "Could not save checklist progress.");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleApprove = async (event) => {
    event.preventDefault();

    if (!reviewableSubmission || reviewBusy) return;

    setError("");

    if (walletLoading) {
      setError("Please wait while we check your linked wallet.");
      return;
    }

    if (!isConnected || !address) {
      setError("Connect and link your client NEAR wallet before approving this delivery.");
      return;
    }

    if (!job?.escrowId) {
      setError("This project has no escrow ID, so its funds cannot be released.");
      return;
    }

    setReviewBusy(true);
    let releaseWasSubmitted = Boolean(releaseTransaction?.hash);

    try {
      const previousRelease =
        releaseTransaction?.submissionId === reviewableSubmission.id
          ? releaseTransaction
          : null;
      let transactionHash = previousRelease?.hash ?? null;

      if (!previousRelease) {
        const { approveWorkOnChain } = await import("../services/nearWallet.js");
        transactionHash = await approveWorkOnChain(job.escrowId, address);
        releaseWasSubmitted = true;
        const transaction = {
          escrowId: job.escrowId,
          submissionId: reviewableSubmission.id,
          hash: transactionHash,
        };
        saveReleaseTransaction(jobId, transaction);
        setReleaseTransaction(transaction);
      }

      try {
        if (transactionHash) setCheckingPayout(true);
        await saveAcceptedReview(jobId, reviewableSubmission.id, {
          status: "ACCEPTED",
          feedback: reviewFeedback.trim(),
          transactionHash,
          requirements: submittedRequirements.map(
            ({ requirementPosition }) => ({
              requirementPosition,
              status: "ACCEPTED",
            })
          ),
        });
      } catch (reviewError) {
        const transactionReference = transactionHash
          ? `NEAR transaction ${transactionHash}`
          : "The NEAR transaction";
        throw new Error(
          `${transactionReference} started escrow release, but the submission review could not be saved: ${
            reviewError.message || "Please contact support before retrying approval."
          }`
        );
      }

      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === reviewableSubmission.id
            ? { ...submission, status: "ACCEPTED" }
            : submission
        )
      );
      clearReleaseTransaction(jobId);
      setReleaseTransaction(null);
      setReviewNotice(
        transactionHash
          ? `Delivery approved and payout confirmed on NEAR. Transaction ${transactionHash}.`
          : "Delivery approved and payout confirmed on NEAR."
      );
    } catch (err) {
      setError(
        releaseWasSubmitted
          ? `NEAR release was submitted, but payout confirmation is still pending: ${
              err.message || "Please retry approval shortly."
            }`
          : err.message || "Could not approve this submission."
      );
    } finally {
      setCheckingPayout(false);
      setReviewBusy(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!reviewableSubmission || reviewBusy) return;

    if (!reviewFeedback.trim()) {
      setError("Add a note explaining what needs to change before rejecting this work.");
      return;
    }

    setError("");
    setReviewBusy(true);

    try {
      await reviewSubmission(jobId, reviewableSubmission.id, {
        status: "CHANGES_REQUESTED",
        feedback: reviewFeedback.trim(),
        requirements: submittedRequirements.map(
          ({ requirementPosition }) => ({
            requirementPosition,
            status: reviewedRequirementPositions.includes(requirementPosition)
              ? "ACCEPTED"
              : "PENDING",
          })
        ),
      });

      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === reviewableSubmission.id
            ? { ...submission, status: "CHANGES_REQUESTED" }
            : submission
        )
      );
      setReviewNotice("Changes requested. The freelancer can submit a new version.");
    } catch (err) {
      setError(err.message || "Could not request changes to this submission.");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRequirementReviewChange = async (requirementPosition, checked) => {
    if (!isClient || !reviewableSubmission || reviewBusy) return;

    const position =
      requirementPosition == null ? Number.NaN : Number(requirementPosition);
    const currentRequirements = job?.requirements || [];

    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= currentRequirements.length
    ) {
      setError("This requirement is no longer available in the project checklist.");
      return;
    }

    const previousPositions = reviewedRequirementPositions;
    const nextPositions = checked
      ? [...previousPositions, requirementPosition]
      : previousPositions.filter((position) => position !== requirementPosition);
    const updatedRequirements = currentRequirements.map((requirement, index) =>
      index === position ? { ...requirement, isDone: checked } : requirement
    );

    setError("");
    setReviewedRequirementPositions(nextPositions);
    setJob((current) => ({
      ...current,
      requirements: updatedRequirements,
    }));
    setReviewBusy(true);

    try {
      const progressResponse = await updateChecklistProgress(
        jobId,
        updatedRequirements.map(({ isDone, condition }) => ({
          isDone: Boolean(isDone),
          condition,
        }))
      );
      const updatedJob = normalizeJob(progressResponse);

      if (updatedJob?.id) {
        setJob(updatedJob);
      }

      try {
        await reviewSubmission(jobId, reviewableSubmission.id, {
          status: "PENDING",
          requirements: submittedRequirements.map(
            ({ requirementPosition: position }) => ({
              requirementPosition: position,
              status: nextPositions.includes(position)
                ? "ACCEPTED"
                : "PENDING",
            })
          ),
        });
      } catch (reviewError) {
        setReviewedRequirementPositions(previousPositions);
        setError(
          `Checklist progress was saved, but the submission review could not be saved: ${
            reviewError.message || "Please try again."
          }`
        );
        return;
      }

      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === reviewableSubmission.id
            ? {
                ...submission,
                requirements: submission.requirements.map((requirement) => ({
                  ...requirement,
                  reviewStatus: nextPositions.includes(
                    requirement.requirementPosition
                  )
                    ? "ACCEPTED"
                    : "PENDING",
                })),
              }
            : submission
        )
      );
    } catch (err) {
      setReviewedRequirementPositions(previousPositions);
      setJob((current) => ({
        ...current,
        requirements: currentRequirements,
      }));
      setError(err.message || "Could not save the shared checklist progress.");
    } finally {
      setReviewBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading project...</p>;

  if (!job) {
    return (
      <>
        <PageHeader eyebrow="Delivery" title="Project not found" />
        {loadError && <div className="form-error">{loadError}</div>}
      </>
    );
  }

  const clientFirstName = job.client?.trim()?.split(/\s+/)[0] || "your client";
  const blockedReason = !isFreelancer
    ? "Only the freelancer assigned to this project can submit work."
    : !job.escrowConfirmed
      ? "You can submit work once the client's escrow funding is confirmed."
      : null;
  const freelancerDelivery =
    isFreelancer
      ? result || (reviewableSubmission ? readSubmission(reviewableSubmission) : null)
      : null;

  return (
    <>
      <PageHeader
        eyebrow={`${job.title} / Delivery`}
        title={isClient ? "Review the freelancer's delivery." : "Put your best work forward."}
        subtitle={
          isClient
            ? "Check the submitted files and requirements, then approve the delivery when it meets the agreement."
            : `Share the deliverables and notes. ${clientFirstName} reviews the submission before any payment is released.`
        }
      />

      <ProjectStepper current={Math.max(job.stage, 3)} jobId={job.id} />

      {loadError && <div className="form-error spaced">{loadError}</div>}
      {error && (
        <div className="form-error spaced" role="alert">
          {error}
          {isFreelancer && address && /does not match your linked PayProof wallet/i.test(error) && (
            <Button
              type="button"
              variant="secondary"
              className="spaced-top"
              onClick={handleSwitchToFreelancerWallet}
              disabled={walletSwitching}
            >
              {walletSwitching ? "Switching NEAR account..." : `Switch to ${address}`}
            </Button>
          )}
        </div>
      )}
      {reviewNotice && <p className="muted spaced" role="status">{reviewNotice}</p>}

      <div className="project-grid">
        <div className="stack">
          {isClient ? (
            <>
              {submissions.length === 0 ? (
                <Card title={loadError ? "Unable to load submissions" : "No delivery submitted yet"}>
                  <p className="muted">
                    {loadError
                      ? "Try again later or return to the project."
                      : "The freelancer's submission will appear here when it is ready."}
                  </p>
                  <Link to={`/projects/${job.id}`} className="btn btn-secondary spaced-top">
                    Back to project
                  </Link>
                </Card>
              ) : (
                submissions
                  .filter((submission) => submission.id === reviewableSubmission?.id)
                  .map((submission) => {
                  return (
                    <Card
                      key={submission.id}
                      title={`Submission · Version ${submission.versionNumber}`}
                    >
                    <div className="submit-result">
                      <div className="kv">
                        <span>Status</span>
                        <strong>
                          {String(submission.status || "SUBMITTED")
                            .replace(/_/g, " ")
                            .toLowerCase()}
                        </strong>
                      </div>
                      {submission.submittedAt && (
                        <div className="kv">
                          <span>Submitted</span>
                          <strong>{formatDate(submission.submittedAt)}</strong>
                        </div>
                      )}

                      {submission.fileName && (
                        <div className="file-row">
                          <FileText size={22} />
                          <div className="file-meta">
                            <strong>{submission.fileName}</strong>
                            <span className="muted">
                              {formatSize(submission.fileSizeBytes)}
                            </span>
                          </div>
                          {submission.fileUrl && (
                            <a
                              className="icon-btn"
                              href={submission.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ${submission.fileName}`}
                            >
                              <ArrowUpRight size={20} />
                            </a>
                          )}
                        </div>
                      )}

                      {isHttpUrl(submission.externalUrl) && (
                        <p>
                          <a
                            href={submission.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open delivery link <ArrowUpRight size={14} />
                          </a>
                        </p>
                      )}

                      {submission.notes && (
                        <div>
                          <strong>Message from the freelancer</strong>
                          <p className="quote">{submission.notes}</p>
                        </div>
                      )}

                      <div>
                        <strong>Review each requirement</strong>
                        <p className="muted small spaced-top">
                          Check each item that the delivery satisfies. Each change saves checklist progress and your review. You can approve once every item is checked.
                        </p>
                        <div className="submit-review-progress">
                          <div className="submit-review-progress-heading">
                            <strong>
                              {checkedRequirementCount} of {submittedRequirements.length} requirements met
                            </strong>
                            <Button
                              type="button"
                              variant="secondary"
                              className="btn-sm"
                              onClick={handleCheckAllRequirements}
                              disabled={
                                reviewBusy ||
                                submittedRequirements.length === 0 ||
                                allSubmittedRequirementsReviewed
                              }
                            >
                              {allSubmittedRequirementsReviewed ? "All checked" : "Check all"}
                            </Button>
                          </div>
                          <div
                            className="submit-review-progress-track"
                            role="progressbar"
                            aria-label="Requirements confirmed"
                            aria-valuemin={0}
                            aria-valuemax={submittedRequirements.length}
                            aria-valuenow={checkedRequirementCount}
                          >
                            <div
                              className="submit-review-progress-fill"
                              style={{
                                width: `${
                                  submittedRequirements.length
                                    ? (checkedRequirementCount /
                                        submittedRequirements.length) *
                                      100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                        {reviewBusy && (
                          <p className="muted small" role="status">
                            Saving checklist progress and review...
                          </p>
                        )}
                        <ul className="submit-requirements submit-review-list spaced-top">
                          {(submission.requirements || []).map((requirement, index) => (
                            <li
                              key={requirement.requirementPosition}
                              className={`submit-review-item${
                                reviewedRequirementPositions.includes(requirement.requirementPosition)
                                  ? " is-checked"
                                  : ""
                              }`}
                            >
                              <label className="submit-review-requirement">
                                <input
                                  type="checkbox"
                                  className="submit-review-checkbox"
                                  checked={reviewedRequirementPositions.includes(
                                    requirement.requirementPosition
                                  )}
                                  disabled={reviewBusy}
                                  onChange={(event) =>
                                    handleRequirementReviewChange(
                                      requirement.requirementPosition,
                                      event.target.checked
                                    )
                                  }
                                  aria-label={`Confirm requirement ${index + 1}: ${requirement.condition}`}
                                />
                                <span className="submit-review-number">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="submit-review-condition">
                                  {requirement.condition}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    </Card>
                  );
                })
              )}

              {reviewableSubmission && (
                <div id="release" className="release-step-target">
                <Card title="Approve delivery">
                  <form className="stack" onSubmit={handleApprove}>
                    {releaseTransaction?.submissionId === reviewableSubmission.id && (
                      <div className="callout">
                        Escrow release was already submitted. Retrying will check for payout confirmation and save the review without sending another NEAR transaction.
                      </div>
                    )}
                    {(!isConnected || (error && /wallet|account/i.test(error))) && (
                      <div className="callout">
                        {isConnected
                          ? "Reconnect the NEAR wallet linked to your client account. "
                          : "Connect your client NEAR wallet to approve this delivery and release escrow. "}
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
                      </div>
                    )}
                    {!allSubmittedRequirementsReviewed && (
                      <div className="callout callout-warn">
                        Check each requirement above to confirm that the delivery satisfies it.
                      </div>
                    )}
                    <div className="field">
                      <label className="field-label" htmlFor="review-feedback">
                        Note to freelancer
                      </label>
                      <div className="field-control">
                        <textarea
                          id="review-feedback"
                          rows={4}
                          value={reviewFeedback}
                          onChange={(event) => setReviewFeedback(event.target.value)}
                          maxLength={10000}
                          disabled={reviewBusy}
                          placeholder="Explain what needs to change. Required when rejecting this work."
                        />
                      </div>
                    </div>
                    <div className="action-row">
                      <Button
                        type="submit"
                        icon={CircleCheck}
                        disabled={
                          reviewBusy ||
                          !allSubmittedRequirementsReviewed ||
                          !isConnected ||
                          walletLoading
                        }
                      >
                        {checkingPayout
                          ? "Waiting for payout confirmation..."
                          : reviewBusy
                            ? "Approving..."
                            : releaseTransaction?.submissionId === reviewableSubmission.id
                              ? "Retry payout confirmation"
                              : "Approve submission"}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={handleRequestChanges}
                        disabled={reviewBusy}
                      >
                        {reviewBusy ? "Saving..." : "Reject work"}
                      </Button>
                    </div>
                    <p className="muted small">
                      Approval confirms the submitted work meets the agreed requirements. Rejecting returns it to the freelancer so they can submit a new version.
                    </p>
                  </form>
                </Card>
                </div>
              )}

              {submissions.length > 0 && (
                <Card title="Submission versions">
                  <p className="muted">
                    Open a version to view its delivery details. The requirement checklist is only shown for the current review.
                  </p>
                  <ul className="submit-requirements spaced-top">
                    {submissions.map((submission) => (
                      <li key={submission.id}>
                        <FileText size={18} />
                        <Link to={`/projects/${job.id}/submissions/${submission.id}`}>
                          Version {submission.versionNumber} ·{" "}
                          {String(submission.status || "SUBMITTED")
                            .replace(/_/g, " ")
                            .toLowerCase()}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : freelancerDelivery ? (
            <Card title="Submission received">
              <div className="submit-result">
                <p className="submit-result-title">
                  <CircleCheck size={22} />
                  Your work was submitted.
                </p>

                {freelancerDelivery.versionNumber != null && (
                  <div className="kv">
                    <span>Version</span>
                    <strong>{freelancerDelivery.versionNumber}</strong>
                  </div>
                )}
                {freelancerDelivery.status && (
                  <div className="kv">
                    <span>Status</span>
                    <strong>{String(freelancerDelivery.status).replace(/_/g, " ").toLowerCase()}</strong>
                  </div>
                )}
                {freelancerDelivery.fileName && (
                  <div className="kv">
                    <span>File</span>
                    <strong>
                      {freelancerDelivery.fileName}
                      {formatSize(freelancerDelivery.fileSizeBytes) ? ` · ${formatSize(freelancerDelivery.fileSizeBytes)}` : ""}
                    </strong>
                  </div>
                )}
                {freelancerDelivery.externalUrl && (
                  <div className="kv">
                    <span>Link</span>
                    <strong className="mono">{freelancerDelivery.externalUrl}</strong>
                  </div>
                )}
                {freelancerDelivery.submittedAt && (
                  <div className="kv">
                    <span>Submitted</span>
                    <strong>{formatDate(freelancerDelivery.submittedAt)}</strong>
                  </div>
                )}
                {freelancerDelivery.id && (
                  <Link
                    to={`/projects/${job.id}/submissions/${freelancerDelivery.id}`}
                    className="btn btn-secondary spaced-top"
                  >
                    View this submission version
                  </Link>
                )}
                {workTransaction?.escrowId === job.escrowId &&
                workTransaction?.submissionId === freelancerDelivery.id ? (
                  <p className="muted small spaced-top" role="status">
                    The escrow is marked as work submitted on NEAR
                    {workTransaction.hash ? ` · Transaction ${workTransaction.hash}` : ""}.
                  </p>
                ) : (
                  <div className="callout callout-warn spaced-top">
                    This delivery is saved, but the escrow still needs to be marked as work submitted on NEAR before the client can approve it.
                    <Button
                      type="button"
                      icon={Send}
                      disabled={busy || walletSwitching || walletLoading || !isConnected}
                      onClick={async () => {
                        setError("");
                        setBusy(true);
                        try {
                          const { submitWorkOnChain } = await import(
                            "../services/nearWallet.js"
                          );
                          const evidence = buildWorkEvidence(freelancerDelivery);
                          const transactionHash = await submitWorkOnChain(
                            job.escrowId,
                            evidence,
                            address
                          );
                          const transaction = {
                            escrowId: job.escrowId,
                            accountId: address,
                            evidence,
                            hash: transactionHash,
                            submissionId: freelancerDelivery.id,
                          };
                          saveWorkTransaction(jobId, transaction);
                          setWorkTransaction(transaction);
                        } catch (transactionError) {
                          setError(
                            transactionError.message ||
                              "Could not mark the delivery as submitted on NEAR."
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy || walletSwitching
                        ? "Updating escrow..."
                        : "Retry on-chain submission"}
                    </Button>
                    {!isConnected && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={connect}
                        disabled={walletLoading || !!walletBusy}
                      >
                        {walletBusy === "connect" ? "Connecting..." : "Connect wallet"}
                      </Button>
                    )}
                  </div>
                )}

                <p className="muted small spaced-top">
                  Submitting does not release funds. Your payment stays in escrow until {clientFirstName}{" "}
                  reviews and accepts the delivery.
                </p>

                <div className="action-row spaced-top">
                  <Link to={`/projects/${job.id}`} className="btn btn-primary">
                    Back to project
                  </Link>
                </div>
              </div>
            </Card>
          ) : blockedReason ? (
            <Card title="Submit your delivery">
              <div className="callout callout-warn">{blockedReason}</div>

              <div className="action-row spaced-top">
                <Link to={`/projects/${job.id}`} className="btn btn-secondary">
                  Back to project
                </Link>
                {isFreelancer && (
                  <Link to={`/escrow/${job.id}`} className="btn btn-secondary">
                    View escrow status
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <Card title="Prepare your delivery">
                <div className="stack-sm">
                  <div className="field">
                    <span className="field-label">Deliverable file</span>

                    <div className="submit-file">
                      {file ? (
                        <div className="file-row">
                          <FileText size={22} />
                          <div className="file-meta">
                            <strong>{file.name}</strong>
                            <span className="muted">{formatSize(file.size)} · Ready to upload</span>
                          </div>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Remove file"
                            onClick={() => setFile(null)}
                            disabled={busy}
                          >
                            <X size={20} />
                          </button>
                        </div>
                      ) : (
                        <label className="btn btn-secondary submit-file-pick">
                          Choose a file
                          <input
                            ref={fileInputRef}
                            type="file"
                            hidden
                            onChange={pickFile}
                            disabled={busy}
                          />
                        </label>
                      )}

                      <p className="muted submit-file-hint">
                        Any file type, up to {MAX_FILE_MB} MB. A file, a link, or both.
                      </p>

                      {fileError && <p className="field-error">{fileError}</p>}
                    </div>
                  </div>

                  <TextField
                    label="Delivery link"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    disabled={busy}
                    hint="For example a Figma, GitHub or hosted preview link."
                  />

                  <div className="field">
                    <label className="field-label" htmlFor="submission-notes">
                      Message to {clientFirstName}
                    </label>
                    <div className="field-control">
                      <textarea
                        id="submission-notes"
                        rows={5}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={busy}
                        maxLength={MAX_NOTES}
                        placeholder="Explain what you're delivering and anything the client should check."
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {workTransaction?.escrowId === job.escrowId &&
                !workTransaction?.submissionId && (
                  <div className="callout" role="status">
                    The NEAR escrow is already marked as work submitted. Retrying will save the delivery without sending another on-chain transaction; use the same delivery link, notes, and file name.
                  </div>
                )}

              <div className="action-row">
                <Button type="submit" icon={Send} disabled={busy}>
                  {busy
                    ? "Submitting..."
                    : workTransaction?.escrowId === job.escrowId &&
                      !workTransaction?.submissionId
                      ? "Retry saving delivery"
                      : "Submit for client review"}
                </Button>
                <Link to={`/projects/${job.id}`} className="btn btn-secondary">
                  Cancel
                </Link>
              </div>
              {!isConnected && (
                <div className="callout">
                  Connect your freelancer NEAR wallet to submit work and update the escrow status.{" "}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={connect}
                    disabled={walletLoading || !!walletBusy}
                  >
                    {walletBusy === "connect" ? "Connecting..." : "Connect wallet"}
                  </Button>
                </div>
              )}

              <p className="muted small">
                Submitting does not release funds. Your payment stays in escrow until the client
                reviews and accepts the delivery.
              </p>
            </form>
          )}
        </div>

        <aside className="stack">
          <Card title="Project snapshot">
            <h3 className="snapshot-title">{job.title}</h3>
            <p className="muted small">
              {job.escrowConfirmed ? "Funded · Work in progress" : "Waiting for funding"}
            </p>
            <hr className="rule" />
            <div className="kv"><span>Client</span><strong>{job.client || "—"}</strong></div>
            <div className="kv"><span>Freelancer</span><strong>{job.freelancer || "—"}</strong></div>
            <div className="kv"><span>Amount</span><strong>{formatAmount(job.amount, job.currency)}</strong></div>
            <div className="kv"><span>Delivery</span><strong>{formatDate(job.deadline)}</strong></div>
            <p className="muted small spaced-top">
              {job.id} · Created {formatDate(job.createdAt)}
            </p>
          </Card>
          {isFreelancer && (
            <Card title="Submission history">
              {submissions.length === 0 ? (
                <p className="muted">Your submitted versions will appear here.</p>
              ) : (
                <ul className="submission-history">
                  {submissions.map((submission) => {
                    const status = String(submission.status || "SUBMITTED").toUpperCase();
                    const needsChanges = status === "CHANGES_REQUESTED";

                    return (
                      <li
                        key={submission.id}
                        className={needsChanges ? "submission-history-item is-rejected" : "submission-history-item"}
                      >
                        <div className="submission-history-info">
                          <strong>Version {submission.versionNumber}</strong>
                          <span className={`submission-status${needsChanges ? " is-rejected" : ""}`}>
                            {needsChanges ? "Rejected · changes requested" : status.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </div>
                        {needsChanges && (
                          <p className="submission-history-feedback">
                            {submission.reviewFeedback || "The client requested changes to this version."}
                          </p>
                        )}
                        <Link to={`/projects/${job.id}/submissions/${submission.id}`}>
                          View version details
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}