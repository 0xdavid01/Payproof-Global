import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Download, FileText, ShieldCheck, Sparkles, Upload } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import ProjectStepper from "../components/ProjectStepper.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import FileDropzone from "../components/FileDropzone.jsx";
import FinancialTermsCard from "../components/FinancialTermsCard.jsx";
import PdfPreview from "../components/PdfPreview.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getJob } from "../services/jobService.js";
import {
  approveContract,
  getContractDownloadUrl,
  requestContractChanges,
  uploadContract,
} from "../services/contractService.js";
import { resolveFileUrl } from "../services/jobFiles.js";
import { formatAmount, formatDate, normalizeJob } from "../services/jobMapper.js";

function ApprovalRow({ name, role, approved, isYou }) {
  let tone = "muted";
  let text = "Not yet approved";
  if (approved) {
    tone = "green";
    text = "Approved";
  } else if (isYou) {
    tone = "amber";
    text = "Your approval needed";
  }
  return (
    <div className="approval-row">
      <strong>
        {name || "—"} · {role}
      </strong>
      <span className={`pill pill-${tone}`}>
        <span className="dot" />
        {text}
      </span>
    </div>
  );
}

export default function AgreementReview() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const isFreelancer = user?.role === "FREELANCER";

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [file, setFile] = useState(null);
  const [agree, setAgree] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [previewKey, setPreviewKey] = useState(0); // bumps to reload the PDF preview

  const load = useCallback(async () => {
    try {
      const normalizedJob = normalizeJob(await getJob(jobId));
      if (normalizedJob?.contract?.exists) {
        try {
          const download = await getContractDownloadUrl(jobId);
          if (!download?.url || !/^https?:\/\//i.test(download.url)) {
            throw new Error("The server did not return a valid agreement download URL.");
          }
          normalizedJob.contract.fileUrl = download.url;
          setError("");
        } catch (downloadError) {
          normalizedJob.contract.fileUrl = null;
          setError(downloadError.message || "Could not load the agreement PDF.");
        }
      } else {
        setError("");
      }
      setJob(normalizedJob);
    } catch (err) {
      setError(err.message || "Could not load this agreement.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, action, doneMessage) => {
    setError("");
    setSuccess("");
    setBusy(key);
    try {
      await action();
      await load();
      setSuccess(doneMessage);
      return true;
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose your agreement PDF first.");
      return;
    }
    const ok = await run("upload", () => uploadContract(jobId, file), "Agreement uploaded.");
    if (ok) {
      setFile(null);
      setAgree(false);
      setPreviewKey((k) => k + 1);
    }
  };

  const handleApprove = async () => {
    const ok = await run("approve", () => approveContract(jobId), "Your approval is recorded.");
    if (ok) setAgree(false);
  };

  const handleRequestChanges = async () => {
    if (!reason.trim()) {
      setError("Tell the freelancer what should change.");
      return;
    }
    const ok = await run(
      "changes",
      () => requestContractChanges(jobId, reason.trim()),
      "Your change request was sent."
    );
    if (ok) {
      setReason("");
      setChangeOpen(false);
    }
  };

  // Called after the client edits the payment terms. The backend clears approvals.
  const handleTermsUpdated = (updatedJob, { hadContract } = {}) => {
    setJob(updatedJob);
    setAgree(false);
    setError("");
    setPreviewKey((k) => k + 1);
    setSuccess(
      hadContract
        ? "Payment terms updated. Existing approvals were cleared and the freelancer needs to upload an updated agreement."
        : "Payment terms updated."
    );
  };

  const scrollToUpload = () =>
    document.getElementById("build-agreement")?.scrollIntoView({ behavior: "smooth" });

  if (loading) return <p className="muted">Loading agreement...</p>;
  if (!job) {
    return (
      <>
        <PageHeader eyebrow="Agreements" title="Agreement not found" />
        {error && <div className="form-error">{error}</div>}
      </>
    );
  }

  const c = job.contract;
  const contractUrl = c.exists ? resolveFileUrl("contract", job.id, c.fileUrl) : null;
  const myApproved = isFreelancer ? c.freelancerApproved : c.clientApproved;
  const otherName = isFreelancer ? job.client : job.freelancer;
  const otherFirst = (otherName || "").split(" ")[0] || "The other party";
  const freelancerFirst = (job.freelancer || "").split(" ")[0] || "The freelancer";
  const canApprove = c.exists && !myApproved && !c.approved && c.status !== "CHANGES_REQUESTED";
  const changesRequested = (c.changeRequest || c.status === "CHANGES_REQUESTED") && !c.approved;

  return (
    <>
      <PageHeader
        eyebrow={`${job.title} / Agreement`}
        title="Clear terms. Shared confidence."
        subtitle="Review the agreement and approve the exact version you'll work from."
      />

      <ProjectStepper current={Math.max(job.stage, 1)} jobId={job.id} />

      {error && <div className="form-error spaced">{error}</div>}
      {success && <div className="form-notice spaced">{success}</div>}
      {changesRequested && (
        <div className="callout callout-warn spaced">
          <strong>Changes requested</strong>
          <p>
            {c.changeRequest ||
              "The payment terms or agreement need updating. Upload a new version for both parties to approve."}
          </p>
        </div>
      )}

      <div className="project-grid">
        <div className="stack">
          {/* ---------- build agreement ---------- */}
          <div id="build-agreement">
            <Card title="Build your agreement">
              <div className="option-grid">
                <div className="option-tile">
                  <Upload size={22} className="option-icon" />
                  <p className="muted">
                    {isFreelancer
                      ? "Have a contract? Propose it for review."
                      : "Your freelancer uploads their agreement for you to review."}
                  </p>
                  {isFreelancer && (
                    <Button
                      variant="secondary"
                      block
                      onClick={handleUpload}
                      disabled={!file || !!busy}
                    >
                      {busy === "upload" ? "Uploading..." : "Upload contract"}
                    </Button>
                  )}
                </div>

                <div className="option-tile accent">
                  <Sparkles size={22} className="option-icon" />
                  <p className="muted">Start from the PRD and agreed terms.</p>
                  <Button
                    variant="secondary"
                    block
                    disabled
                    title="AI-assisted drafting is coming soon"
                  >
                    Generate AI draft
                  </Button>
                </div>
              </div>

              {isFreelancer && (
                <div className="spaced-top">
                  <FileDropzone
                    file={file}
                    onChange={setFile}
                    disabled={!!busy}
                    title="Drop your agreement here, or browse files"
                    hint="PDF · Up to 20 MB"
                  />
                </div>
              )}

              {c.exists ? (
                <div className="file-row">
                  <FileText size={22} />
                  <div className="file-meta">
                    <strong>{c.fileName || "Current agreement"}</strong>
                    <span className="muted">
                      Current version{c.version ? ` · v${c.version}` : ""}
                    </span>
                  </div>
                  {contractUrl && (
                    <a
                      href={contractUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-btn"
                      aria-label="Open agreement"
                    >
                      <Download size={20} />
                    </a>
                  )}
                </div>
              ) : (
                <p className="muted spaced-top">
                  {isFreelancer
                    ? "No agreement uploaded yet. Upload yours to start the review."
                    : `Waiting for ${otherFirst} to upload an agreement.`}
                </p>
              )}

              <p className="muted small spaced-top">
                Uploading a new version resets approvals. Review every clause before approving.
              </p>
            </Card>
          </div>

          {/* ---------- agreement preview ---------- */}
          {c.exists && (
            <Card title={isFreelancer ? "Your agreement" : `${freelancerFirst}'s agreement`}>
              <PdfPreview
                key={`${c.version ?? "v"}-${contractUrl}-${previewKey}`}
                url={contractUrl}
                name={c.fileName}
                refreshKey={previewKey}
              />
              <p className="muted small spaced-top">
                Read every clause before approving. Approvals are recorded against this exact
                version{c.version ? ` (v${c.version})` : ""}.
              </p>
            </Card>
          )}

          {/* ---------- approve ---------- */}
          <Card title="Approve the final agreement">
            {c.approved ? (
              <div className="callout">
                <strong>Agreement approved by both parties</strong>
                <p>
                  {isFreelancer
                    ? "Wait for the client to fund escrow before starting work."
                    : "You can now fund the escrow."}
                </p>
              </div>
            ) : (
              <>
                <label className="check spaced-bottom">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    disabled={!canApprove}
                  />
                  I have reviewed this version and its cancellation terms. I agree to this scope,
                  payment and review process.
                </label>

                <div className="action-row">
                  <Button
                    icon={Check}
                    onClick={handleApprove}
                    disabled={!canApprove || !agree || !!busy}
                  >
                    {busy === "approve" ? "Approving..." : myApproved ? "You approved" : "Approve final agreement"}
                  </Button>

                  {isFreelancer ? (
                    <Button variant="secondary" onClick={scrollToUpload} disabled={!!busy}>
                      Upload new version
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => setChangeOpen((o) => !o)}
                      disabled={!c.exists || !!busy}
                    >
                      Propose changes
                    </Button>
                  )}
                </div>

                {!isFreelancer && changeOpen && (
                  <div className="change-box">
                    <label className="field-label" htmlFor="change-reason">
                      What should change?
                    </label>
                    <div className="field-control">
                      <textarea
                        id="change-reason"
                        rows={4}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Please clarify the payment terms and delivery timeline."
                      />
                    </div>
                    <div className="action-row">
                      <Button onClick={handleRequestChanges} disabled={!!busy}>
                        {busy === "changes" ? "Sending..." : "Send change request"}
                      </Button>
                      <Button variant="secondary" onClick={() => setChangeOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="callout callout-row spaced-top">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>
                      {myApproved ? `${otherFirst} must approve next` : "Both approvals are required"}
                    </strong>
                    <p>
                      {myApproved
                        ? "Funding remains closed until both approvals are recorded for this same version."
                        : "Funding stays closed until you and " + otherFirst + " approve this same version."}
                    </p>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ---------- right column ---------- */}
        <aside className="stack">
          <Card title="Project snapshot">
            <h3 className="snapshot-title">{job.title}</h3>
            <p className="muted small">Invitation accepted</p>
            <hr className="rule" />
            <div className="kv"><span>Client</span><strong>{job.client || "—"}</strong></div>
            <div className="kv"><span>Freelancer</span><strong>{job.freelancer || "—"}</strong></div>
            <div className="kv"><span>Amount</span><strong>{formatAmount(job.amount, job.currency)}</strong></div>
            <div className="kv"><span>Delivery</span><strong>{formatDate(job.deadline)}</strong></div>
            <p className="muted small spaced-top">
              {job.id} · Created {formatDate(job.createdAt)}
            </p>
            <Link to={`/projects/${job.id}`} className="row-link small">
              View brief and requirements →
            </Link>
          </Card>

          {!isFreelancer && <FinancialTermsCard job={job} onUpdated={handleTermsUpdated} />}

          <Card title={`Approval status${c.version ? ` · v${c.version}` : ""}`}>
            <ApprovalRow
              name={job.client}
              role="Client"
              approved={c.clientApproved || c.approved}
              isYou={!isFreelancer}
            />
            <ApprovalRow
              name={job.freelancer}
              role="Freelancer"
              approved={c.freelancerApproved || c.approved}
              isYou={isFreelancer}
            />
            <p className="muted small spaced-top">
              Any change creates a new version and requires both parties to approve again.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}