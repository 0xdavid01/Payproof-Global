import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  FileText,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getContractDownloadUrl } from "../services/contractService.js";
import { getActivity } from "../services/activityService.js";
import { getJob, reconcileEscrowRelease } from "../services/jobService.js";
import { getSubmissions } from "../services/submissionService.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
  toList,
} from "../services/jobMapper.js";
import { calculatePlatformFee } from "../services/fees.js";
import {
  explorerTxUrl,
  NETWORK_LABEL,
} from "../services/escrowService.js";
import "../css/payment-receipt.css";

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function timeLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function shorten(value) {
  if (!value || value.length < 20) return value || "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function ReceiptSteps({ jobId }) {
  const steps = ["Review", "Agreement", "Funding", "Work", "Release"];
  const paths = [
    `/projects/${jobId}`,
    `/agreements/${jobId}`,
    `/escrow/${jobId}`,
    `/projects/${jobId}/submission`,
    `/projects/${jobId}/receipt`,
  ];

  return (
    <nav className="receipt-steps" aria-label="Project progress">
      {steps.map((step, index) => (
        <Link
          to={paths[index]}
          className="receipt-step"
          aria-current={index === 4 ? "step" : undefined}
          key={step}
        >
          <Check size={13} />
          {step}
        </Link>
      ))}
    </nav>
  );
}

export default function PaymentReceipt() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const isFreelancer = user?.role === "FREELANCER";
  const [job, setJob] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [activities, setActivities] = useState([]);
  const [agreementUrl, setAgreementUrl] = useState("");
  const [activityError, setActivityError] = useState("");
  const [agreementError, setAgreementError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const platformFee = calculatePlatformFee(job?.amount);

  const loadReceipt = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      let jobData = await getJob(jobId);
      let normalizedJob = normalizeJob(jobData);

      if (String(normalizedJob.raw?.status || "").toUpperCase() !== "COMPLETED") {
        const reconciliation = await reconcileEscrowRelease(jobId);
        if (reconciliation?.released) {
          jobData = await getJob(jobId);
          normalizedJob = normalizeJob(jobData);
        }
      }

      const [submissionResult, activityResult] = await Promise.allSettled([
        getSubmissions(jobId),
        getActivity(),
      ]);
      if (submissionResult.status === "rejected") {
        throw submissionResult.reason;
      }

      const submissions = toList(submissionResult.value);
      const acceptedSubmission = submissions.find(
        (item) => String(item.status || "").toUpperCase() === "ACCEPTED"
      );

      setJob(normalizedJob);
      setSubmission(acceptedSubmission || null);
      setActivityError(
        activityResult.status === "rejected"
          ? "Project timeline could not be loaded."
          : ""
      );
      setActivities(
        toList(
          activityResult.status === "fulfilled" ? activityResult.value : []
        )
          .filter((item) => item.jobId === jobId)
          .sort(
            (a, b) =>
              new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0)
          )
      );

      if (normalizedJob.contract.exists) {
        try {
          const contract = await getContractDownloadUrl(jobId);
          setAgreementUrl(isHttpUrl(contract?.url) ? contract.url : "");
          setAgreementError(
            isHttpUrl(contract?.url) ? "" : "Agreement download is unavailable."
          );
        } catch {
          setAgreementUrl("");
          setAgreementError("Agreement download is unavailable.");
        }
      } else {
        setAgreementUrl("");
        setAgreementError("");
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load the payment receipt.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  if (loading) {
    return <p className="muted">Loading payment receipt...</p>;
  }

  if (error || !job) {
    return (
      <>
        <PageHeader eyebrow="Payment receipt" title="Receipt unavailable" />
        <div className="form-error spaced" role="alert">
          {error || "Could not find this project."}
        </div>
        <button type="button" className="btn btn-secondary" onClick={loadReceipt}>
          Try again
        </button>
      </>
    );
  }

  const completed =
    String(job.raw?.status || "").toUpperCase() === "COMPLETED";
  const releaseHash = submission?.releaseTransactionHash || null;
  const clientName = job.client || "Client";
  const freelancerName = job.freelancer || "Freelancer";
  const recipientWallet =
    job.raw?.escrowCreationFreelancerWallet ||
    job.raw?.freelancerWalletAddress ||
    null;
  const receiptDate = submission?.reviewedAt || job.raw?.updatedAt;
  const deliveryLink = isHttpUrl(submission?.fileUrl)
    ? submission.fileUrl
    : isHttpUrl(submission?.externalUrl)
      ? submission.externalUrl
      : null;
  const deliveryName =
    submission?.fileName ||
    (submission?.externalUrl ? "Freelancer delivery link" : "Delivery evidence");
  const paymentAction = isFreelancer
    ? `${clientName} approved your final delivery. The project payment is confirmed on NEAR.`
    : `Your approval and the release transaction are confirmed. ${job.title} is complete.`;

  return (
    <div className="payment-receipt-page">
      <PageHeader
        eyebrow={`${job.title} / Payment receipt · ${formatDate(receiptDate)}`}
        title={
          isFreelancer
            ? "Great work. Payment received."
            : "Approved. Paid. All accounted for."
        }
        subtitle={paymentAction}
        actions={
          <button
            type="button"
            className="btn btn-secondary receipt-print-button"
            onClick={() => window.print()}
          >
            <Download size={17} />
            Download receipt
          </button>
        }
      />

      <ReceiptSteps jobId={job.id} />

      {!completed ? (
        <Card title="Payment is not confirmed yet">
          <p className="muted">
            This project has not been marked complete. The receipt will be
            available after NEAR confirms the escrow release.
          </p>
          <Link
            to={`/projects/${job.id}/submission#release`}
            className="btn btn-primary spaced-top"
          >
            Check release status
          </Link>
        </Card>
      ) : (
        <div className="receipt-grid">
          <main className="receipt-main">
            <Card className="receipt-payment-card">
              <div className="receipt-success-icon">
                <Check size={25} strokeWidth={2.5} />
                <Check size={16} strokeWidth={2.5} />
              </div>
              <p className="receipt-kicker">
                {isFreelancer
                  ? `Received in ${recipientWallet || "your NEAR wallet"}`
                  : `Released to ${freelancerName}`}
              </p>
              <p className="receipt-amount">
                {formatAmount(job.amount, job.currency)}
              </p>
              <p className="receipt-confirmed">
                <span className="dot" />
                Confirmed on NEAR · Project complete
              </p>

              <div className="receipt-details">
                <div>
                  <span>Sender</span>
                  <strong>PayProof project escrow</strong>
                </div>
                {job.raw?.escrowId && (
                  <div>
                    <span>Escrow ID</span>
                    <strong>{job.raw.escrowId}</strong>
                  </div>
                )}
                {job.raw?.escrowCreationClientWallet && (
                  <div>
                    <span>Client wallet</span>
                    <strong>{shorten(job.raw.escrowCreationClientWallet)}</strong>
                  </div>
                )}
                <div>
                  <span>Recipient</span>
                  <strong>
                    {freelancerName}
                    {recipientWallet ? ` · ${shorten(recipientWallet)}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Release authorized by</span>
                  <strong>{clientName}</strong>
                </div>
                <div>
                  <span>Confirmed</span>
                  <strong>{timeLabel(receiptDate)}</strong>
                </div>
                <div>
                  <span>Remaining project escrow</span>
                  <strong>{formatAmount(0, job.currency)}</strong>
                </div>
              </div>

              {releaseHash ? (
                <a
                  className="receipt-explorer-link"
                  href={explorerTxUrl(releaseHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shorten(releaseHash)} · View on NEAR Explorer
                  <ExternalLink size={14} />
                </a>
              ) : (
                <p className="receipt-muted-note">
                  Release transaction reference is unavailable.
                </p>
              )}
            </Card>

            <Card title="Payment breakdown" className="receipt-breakdown">
              <div className="receipt-breakdown-row receipt-breakdown-primary">
                <span>Project payment to {freelancerName}</span>
                <strong>{formatAmount(job.amount, job.currency)}</strong>
              </div>
              <div className="receipt-breakdown-row">
                <span>Client platform fee · 3.5%</span>
                <strong>{formatAmount(platformFee, job.currency)}</strong>
              </div>
              <div className="receipt-breakdown-row">
                <span>Total funded by client</span>
                <strong>{formatAmount(Number(job.amount) + platformFee, job.currency)}</strong>
              </div>
              <p className="receipt-muted-note">
                The freelancer receives the full project amount. Network
                transaction fees are separate from the client platform fee.
              </p>
              <div className="receipt-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => window.print()}
                >
                  <Download size={16} />
                  Download receipt
                </button>
                <Link to="/projects" className="btn btn-secondary">
                  Back to projects
                </Link>
              </div>
            </Card>

            <Card title="A complete project record" className="receipt-record">
              {agreementUrl && (
                <a
                  className="receipt-document"
                  href={agreementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText size={18} />
                  <span>
                    <strong>{job.contract.fileName || "Project agreement"}</strong>
                    <small>
                      Mutually approved
                      {job.raw?.updatedAt ? ` · ${formatDate(job.raw.updatedAt)}` : ""}
                    </small>
                  </span>
                  <Download size={16} />
                </a>
              )}
              {agreementError && (
                <p className="receipt-muted-note">{agreementError}</p>
              )}
              {deliveryLink ? (
                <a
                  className="receipt-document"
                  href={deliveryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PackageCheck size={18} />
                  <span>
                    <strong>{deliveryName}</strong>
                    <small>
                      Approved by {clientName}
                      {submission?.reviewedAt
                        ? ` · ${formatDate(submission.reviewedAt)}`
                        : ""}
                    </small>
                  </span>
                  <Download size={16} />
                </a>
              ) : (
                <Link
                  className="receipt-document"
                  to={`/projects/${job.id}/submission`}
                >
                  <PackageCheck size={18} />
                  <span>
                    <strong>Final delivery evidence</strong>
                    <small>View the approved submission</small>
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              )}
              <p className="receipt-muted-note">
                The agreement, delivery evidence, and payment confirmation
                remain available with this completed project.
              </p>
            </Card>
          </main>

          <aside className="receipt-aside">
            <Card title="Project snapshot">
              <h2 className="receipt-project-title">{job.title}</h2>
              <p className="receipt-muted-note">
                Completed · Paid in full
              </p>
              <hr />
              <dl className="receipt-snapshot">
                <div><dt>Client</dt><dd>{clientName}</dd></div>
                <div><dt>Freelancer</dt><dd>{freelancerName}</dd></div>
                <div><dt>Amount</dt><dd>{formatAmount(job.amount, job.currency)}</dd></div>
                <div><dt>Delivery</dt><dd>{formatDate(submission?.submittedAt || job.deadline)}</dd></div>
              </dl>
              <p className="receipt-muted-note spaced-top">
                {job.id} · Created {formatDate(job.createdAt)}
              </p>
            </Card>

            <Card title="From agreement to payment">
              {activities.length ? (
                <ol className="receipt-timeline">
                  {activities.slice(0, 6).map((activity) => (
                    <li key={activity.id}>
                      <ShieldCheck size={15} />
                      <span>
                        <strong>{activity.summary}</strong>
                        <small>
                          {timeLabel(activity.occurredAt)} · {activity.actorName}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="receipt-muted-note">
                  {activityError ||
                    "Project actions will appear here as they are recorded."}
                </p>
              )}
            </Card>

            <Card title="Network">
              <p className="receipt-network-label">{NETWORK_LABEL}</p>
              {job.raw?.escrowCreationClientWallet && (
                <p className="receipt-muted-note">
                  Client wallet · {shorten(job.raw.escrowCreationClientWallet)}
                </p>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
