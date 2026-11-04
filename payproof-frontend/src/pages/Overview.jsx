import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Coins,
  FileCheck,
  FileText,
  Folder,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import "../css/overview.css";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getCurrentUser } from "../services/authService.js";
import {
  getClientJobs,
  getFreelancerJobs,
  reconcileEscrowRelease,
} from "../services/jobService.js";
import { getSubmissions } from "../services/submissionService.js";
import {
  formatAmount,
  formatDate,
  normalizeJob,
  prettyStatus,
  toList,
} from "../services/jobMapper.js";

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(user) {
  if (user?.firstName) return user.firstName;

  if (user?.email) {
    const local = user.email.split("@")[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  return "there";
}

function todayLabel() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const rest = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${weekday}, ${rest}`.toUpperCase();
}

function currencyTotals(jobs) {
  const totals = new Map();
  jobs.forEach((job) => {
    const currency = job.currency || "NEAR";
    totals.set(currency, (totals.get(currency) || 0) + Number(job.amount || 0));
  });

  if (totals.size === 0) return "0";
  return [...totals.entries()]
    .map(([currency, amount]) => `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${currency}`)
    .join(" · ");
}

function isFinished(job) {
  return ["COMPLETED", "CANCELLED"].includes(
    String(job.raw?.status || "").toUpperCase()
  );
}

function isPendingReview(submissions = []) {
  return submissions.some((submission) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(
      String(submission.status || "").toUpperCase()
    )
  );
}

function activityFor(jobs) {
  const events = [];

  jobs.forEach((job) => {
    if (job.invitation !== "pending" && job.raw?.createdAt) {
      events.push({
        icon: Folder,
        title: `Project started · ${job.title}`,
        meta: `${formatDate(job.raw.createdAt)} · ${job.client || "Client"}`,
        timestamp: job.raw.createdAt,
      });
    }

    (job.submissions || []).forEach((submission) => {
      const status = String(submission.status || "").toUpperCase();
      const date =
        status === "SUBMITTED" || status === "UNDER_REVIEW"
          ? submission.submittedAt
          : submission.reviewedAt || submission.submittedAt;

      if (status === "CHANGES_REQUESTED") {
        events.push({
          icon: FileText,
          title: `Changes requested on ${job.title} · Version ${submission.versionNumber}`,
          meta: `${formatDate(date)}${submission.reviewFeedback ? ` · ${submission.reviewFeedback}` : ""}`,
          timestamp: date,
        });
      } else if (status === "ACCEPTED") {
        events.push({
          icon: CheckCircle2,
          title: `${job.title} · Version ${submission.versionNumber} approved`,
          meta: formatDate(date),
          timestamp: date,
        });
      } else if (status === "SUBMITTED" || status === "UNDER_REVIEW") {
        events.push({
          icon: Package,
          title: `${job.title} · Version ${submission.versionNumber} submitted`,
          meta: `${formatDate(date)} · Awaiting client review`,
          timestamp: date,
        });
      }
    });

    if (String(job.raw?.status || "").toUpperCase() === "COMPLETED") {
      const date = job.raw?.updatedAt || job.raw?.updated_at;
      events.push({
        icon: CheckCircle2,
        title: `${job.title} completed`,
        meta: formatDate(date),
        timestamp: date,
      });
    }
  });

  return events
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 5);
}

function FreelancerOverview({ user }) {
  const [profile, setProfile] = useState(user);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      setError("");
      setSyncNotice("");

      try {
        const [profileResult, jobsResult] = await Promise.allSettled([
          getCurrentUser(),
          getFreelancerJobs(),
        ]);
        if (cancelled) return;

        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          setProfileError("");
        } else {
          setProfileError("Could not load your full profile name. Showing your account name instead.");
        }
        if (jobsResult.status === "rejected") {
          throw jobsResult.reason;
        }

        const projectList = toList(jobsResult.value)
          .map(normalizeJob)
          .filter((job) => job?.id);
        let withSubmissions = await Promise.all(
          projectList.map(async (job) => {
            if (job.invitation === "pending") return { ...job, submissions: [] };
            return {
              ...job,
              submissions: toList(await getSubmissions(job.id)),
            };
          })
        );
        const fundedJobsToCheck = withSubmissions.filter(
          (job) =>
            !isFinished(job) &&
            job.escrowConfirmed &&
            job.submissions.length > 0
        );
        const reconciliationResults = await Promise.allSettled(
          fundedJobsToCheck.map((job) => reconcileEscrowRelease(job.id))
        );
        const releaseWasReconciled = reconciliationResults.some(
          (result) =>
            result.status === "fulfilled" && result.value?.released === true
        );
        const failedChecks = reconciliationResults.filter(
          (result) => result.status === "rejected"
        ).length;

        if (releaseWasReconciled) {
          const refreshedJobs = toList(await getFreelancerJobs())
            .map(normalizeJob)
            .filter((job) => job?.id);
          withSubmissions = await Promise.all(
            refreshedJobs.map(async (job) => {
              if (job.invitation === "pending") return { ...job, submissions: [] };
              return {
                ...job,
                submissions: toList(await getSubmissions(job.id)),
              };
            })
          );
        }

        if (failedChecks > 0 && !cancelled) {
          setSyncNotice(
            `Could not verify NEAR release status for ${failedChecks} project${failedChecks === 1 ? "" : "s"}. Refresh to try again.`
          );
        }

        if (!cancelled) setJobs(withSubmissions);
      } catch (err) {
        if (!cancelled) {
          setJobs([]);
          setError(err.message || "Could not load your freelancer overview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const completedProjects = jobs.filter(
    (job) => String(job.raw?.status || "").toUpperCase() === "COMPLETED"
  );
  const activeProjects = jobs
    .filter((job) => !isFinished(job))
    .sort(
      (a, b) =>
        new Date(b.raw?.updatedAt || b.raw?.createdAt || 0) -
        new Date(a.raw?.updatedAt || a.raw?.createdAt || 0)
    );
  const heldProjects = activeProjects.filter((job) => job.escrowConfirmed);
  const agreementProjects = jobs.filter((job) => job.contract.exists);
  const mutuallyApproved = agreementProjects.filter((job) => job.contract.approved).length;
  const pendingProjects = activeProjects.filter((job) =>
    isPendingReview(job.submissions)
  );
  const activities = activityFor(jobs);
  const name =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    firstNameOf(profile);

  const statusFor = (job) => {
    if (isPendingReview(job.submissions)) return "Review pending";
    if (job.escrowConfirmed) return "In progress";
    return prettyStatus(job.raw?.status || job.statusText);
  };

  const nextStepFor = (job) => {
    if (job.invitation === "pending") {
      return { label: "Review invitation", to: `/projects/${job.id}` };
    }
    if (isPendingReview(job.submissions)) {
      return { label: "View submission", to: `/projects/${job.id}/submission` };
    }
    if (job.stage >= 3) {
      return { label: "Open project", to: `/projects/${job.id}` };
    }
    if (job.stage === 2) {
      return { label: "View escrow", to: `/escrow/${job.id}` };
    }
    return { label: "Open agreement", to: `/agreements/${job.id}` };
  };

  return (
    <>
      <PageHeader
        eyebrow={`Overview · ${todayLabel()}`}
        title={`${greeting()}, ${name.split(/\s+/)[0] || "there"}.`}
        subtitle="Your projects, client feedback, agreements and earnings at a glance."
        actions={
          <Link to="/projects" className="btn btn-secondary">
            View projects
          </Link>
        }
      />

      {profileError && <div className="form-notice spaced">{profileError}</div>}
      {syncNotice && <div className="form-notice spaced">{syncNotice}</div>}

      {loading ? (
        <Card>
          <p className="muted">Loading your projects and payment summary...</p>
        </Card>
      ) : error ? (
        <Card title="Overview unavailable">
          <p className="muted">{error}</p>
          <button
            type="button"
            className="btn btn-secondary spaced-top"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </Card>
      ) : (
        <>
          <div className="ov-stats">
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Projects completed</span><CheckCircle2 size={22} /></div>
              <div className="ov-stat-value">{completedProjects.length}</div>
              <div className="ov-stat-note">Marked completed</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Paid to you</span><Coins size={22} /></div>
              <div className="ov-stat-value ov-stat-value-compact">{currencyTotals(completedProjects)}</div>
              <div className="ov-stat-note">Completed projects with payout confirmed on NEAR</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Currently in escrow</span><ShieldCheck size={22} /></div>
              <div className="ov-stat-value ov-stat-value-compact">{currencyTotals(heldProjects)}</div>
              <div className="ov-stat-note">{heldProjects.length} funded active projects</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Mutually approved</span><FileCheck size={22} /></div>
              <div className="ov-stat-value">{mutuallyApproved} / {agreementProjects.length}</div>
              <div className="ov-stat-note">Projects with both agreement approvals</div>
            </div>
          </div>

          <Card title="Submission reviews">
            {pendingProjects.length === 0 ? (
              <div className="ov-empty-state">
                <CheckCircle2 size={22} />
                <p>No submissions are currently waiting for client review.</p>
              </div>
            ) : (
              <div className="ov-attention">
                {pendingProjects.map((job) => (
                  <div className="ov-attention-item" key={job.id}>
                    <div className="ov-attention-head">
                      <Clock3 size={22} />
                      <strong>{job.title} is awaiting review</strong>
                    </div>
                    <p>
                      Your latest version is with the client. The funds remain in escrow while they review it.
                    </p>
                    <Link to={`/projects/${job.id}/submission`} className="row-link ov-link-arrow">
                      View submission <ArrowRight size={16} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="ov-section-head">
            <h2>Active projects <span className="ov-count">({activeProjects.length})</span></h2>
            <Link to="/projects" className="row-link ov-link-arrow">View all <ArrowRight size={16} /></Link>
          </div>

          <div className="ov-table-wrap">
            <table className="ov-table">
              <thead>
                <tr><th>Project</th><th>Client</th><th>Amount</th><th>Status</th><th>Next step</th></tr>
              </thead>
              <tbody>
                {activeProjects.slice(0, 5).map((job) => {
                  const next = nextStepFor(job);
                  const pending = isPendingReview(job.submissions);
                  return (
                    <tr key={job.id}>
                      <td>
                        <div className="ov-project">
                          <span className="ov-avatar" aria-hidden="true">{job.title.charAt(0).toUpperCase()}</span>
                          <div><strong>{job.title}</strong><span>Due {formatDate(job.deadline)}</span></div>
                        </div>
                      </td>
                      <td>{job.client || "—"}</td>
                      <td>{formatAmount(job.amount, job.currency)}</td>
                      <td><span className={`pill pill-${pending ? "amber" : job.escrowConfirmed ? "green" : "muted"}`}><span className="dot" />{statusFor(job)}</span></td>
                      <td><Link to={next.to} className="row-link ov-link-arrow">{next.label} <ArrowUpRight size={15} /></Link></td>
                    </tr>
                  );
                })}
                {activeProjects.length === 0 && (
                  <tr><td colSpan="5"><p className="muted">No active projects yet.</p></td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ov-bottom">
            <Card title="Recent activity">
              {activities.length ? (
                <ul className="ov-activity">
                  {activities.map(({ icon: Icon, title, meta }, index) => (
                    <li key={`${title}-${index}`}><Icon size={22} /><div><strong>{title}</strong><span>{meta}</span></div></li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Your project and submission activity will appear here.</p>
              )}
            </Card>
            <Card title="Agreements" className="ov-health">
              <div className="ov-health-value"><strong>{mutuallyApproved} / {agreementProjects.length}</strong><span>mutually approved</span></div>
              <p>{agreementProjects.length - mutuallyApproved} {agreementProjects.length - mutuallyApproved === 1 ? "agreement is" : "agreements are"} not yet mutually approved.</p>
              <div className="ov-health-foot"><Link to="/agreements" className="row-link ov-link-arrow">View agreements <ArrowRight size={16} /></Link></div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function ClientOverview({ user }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      setError("");
      setSyncNotice("");

      try {
        const loadJobsWithSubmissions = async () => {
          const projectList = toList(await getClientJobs())
            .map(normalizeJob)
            .filter((job) => job?.id);
          return Promise.all(
            projectList.map(async (job) => ({
              ...job,
              submissions: toList(await getSubmissions(job.id)),
            }))
          );
        };

        let withSubmissions = await loadJobsWithSubmissions();
        const fundedJobsToCheck = withSubmissions.filter(
          (job) =>
            !isFinished(job) &&
            job.escrowConfirmed &&
            job.submissions.length > 0
        );
        const reconciliationResults = await Promise.allSettled(
          fundedJobsToCheck.map((job) => reconcileEscrowRelease(job.id))
        );
        const releaseWasReconciled = reconciliationResults.some(
          (result) =>
            result.status === "fulfilled" && result.value?.released === true
        );
        const failedChecks = reconciliationResults.filter(
          (result) => result.status === "rejected"
        ).length;

        if (releaseWasReconciled) {
          withSubmissions = await loadJobsWithSubmissions();
        }

        if (failedChecks > 0 && !cancelled) {
          setSyncNotice(
            `Could not verify NEAR release status for ${failedChecks} project${failedChecks === 1 ? "" : "s"}. Refresh to try again.`
          );
        }
        if (!cancelled) setJobs(withSubmissions);
      } catch (loadError) {
        if (!cancelled) {
          setJobs([]);
          setError(loadError.message || "Could not load your client overview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const completedProjects = jobs.filter(
    (job) => String(job.raw?.status || "").toUpperCase() === "COMPLETED"
  );
  const activeProjects = jobs
    .filter((job) => !isFinished(job))
    .sort(
      (a, b) =>
        new Date(b.raw?.updatedAt || b.raw?.createdAt || 0) -
        new Date(a.raw?.updatedAt || a.raw?.createdAt || 0)
    );
  const fundedProjects = activeProjects.filter((job) => job.escrowConfirmed);
  const awaitingAgreement = activeProjects.filter(
    (job) => !job.contract.approved && job.invitation !== "pending"
  );
  const reviewProjects = activeProjects.filter((job) =>
    isPendingReview(job.submissions)
  );
  const agreementProjects = jobs.filter((job) => job.contract.exists);
  const mutuallyApproved = agreementProjects.filter(
    (job) => job.contract.approved
  ).length;
  const activities = activityFor(jobs);
  const name = firstNameOf(user);

  const statusFor = (job) => {
    if (String(job.raw?.status || "").toUpperCase() === "COMPLETED") {
      return "Completed · paid";
    }
    if (isPendingReview(job.submissions)) return "Review delivery";
    if (job.escrowConfirmed) return "Funded · in progress";
    if (job.contract.approved) return "Awaiting funding";
    return prettyStatus(job.raw?.status || job.statusText);
  };

  const nextStepFor = (job) => {
    if (isPendingReview(job.submissions)) {
      return { label: "Review delivery", to: `/projects/${job.id}/submission` };
    }
    if (job.invitation === "pending") {
      return { label: "View invitation", to: `/projects/${job.id}` };
    }
    if (job.contract.exists && !job.contract.approved) {
      return { label: "Review agreement", to: `/agreements/${job.id}` };
    }
    if (job.stage >= 3) {
      return { label: "Open project", to: `/projects/${job.id}` };
    }
    return { label: "Open project", to: `/projects/${job.id}` };
  };

  return (
    <>
      <PageHeader
        className="client-overview-header"
        eyebrow={`Overview · ${todayLabel()}`}
        title={`${greeting()}, ${name.split(/\s+/)[0] || "there"}.`}
        subtitle="Your projects, escrow, delivery reviews and completed payments at a glance."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary client-overview-refresh"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
              aria-label="Refresh totals"
              title="Refresh totals"
            >
              <RefreshCw size={18} />
            </button>
            <Link to="/projects/new" className="btn btn-primary">
              <Plus size={18} />
              Create project
            </Link>
          </>
        }
      />

      {loading ? (
        <Card><p className="muted">Loading your projects and payment summary...</p></Card>
      ) : error ? (
        <Card title="Overview unavailable">
          <p className="muted">{error}</p>
          <button
            type="button"
            className="btn btn-secondary spaced-top"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </Card>
      ) : (
        <>
          {syncNotice && <div className="form-notice spaced">{syncNotice}</div>}
          <div className="ov-stats">
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Active projects</span><Folder size={22} /></div>
              <div className="ov-stat-value">{activeProjects.length}</div>
              <div className="ov-stat-note">Projects still in progress</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Funded escrow</span><ShieldCheck size={22} /></div>
              <div className="ov-stat-value ov-stat-value-compact">{currencyTotals(fundedProjects)}</div>
              <div className="ov-stat-note">{fundedProjects.length} active funded projects</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Paid to freelancers</span><Coins size={22} /></div>
              <div className="ov-stat-value ov-stat-value-compact">{currencyTotals(completedProjects)}</div>
              <div className="ov-stat-note">{completedProjects.length} releases confirmed on NEAR</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat-top"><span>Awaiting agreement</span><FileCheck size={22} /></div>
              <div className="ov-stat-value">{awaitingAgreement.length}</div>
              <div className="ov-stat-note">Projects that need agreement approval or funding</div>
            </div>
          </div>

          <Card title="Submission reviews">
            {reviewProjects.length === 0 ? (
              <div className="ov-empty-state">
                <CheckCircle2 size={22} />
                <p>No submissions are currently waiting for your review.</p>
              </div>
            ) : (
              <div className="ov-attention">
                {reviewProjects.map((job) => (
                  <div className="ov-attention-item" key={job.id}>
                    <div className="ov-attention-head">
                      <Clock3 size={22} />
                      <strong>{job.title} is ready for review</strong>
                    </div>
                    <p>
                      Review the freelancer&apos;s delivery. Approving confirms release on NEAR and marks the project complete after payout verification.
                    </p>
                    <Link to={`/projects/${job.id}/submission`} className="row-link ov-link-arrow">
                      Review delivery <ArrowRight size={16} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="ov-section-head">
            <h2>Active projects <span className="ov-count">({activeProjects.length})</span></h2>
            <Link to="/projects" className="row-link ov-link-arrow">View all <ArrowRight size={16} /></Link>
          </div>

          <div className="ov-table-wrap">
            <table className="ov-table">
              <thead>
                <tr><th>Project</th><th>Freelancer</th><th>Amount</th><th>Status</th><th>Next step</th></tr>
              </thead>
              <tbody>
                {activeProjects.slice(0, 5).map((job) => {
                  const next = nextStepFor(job);
                  const pending = isPendingReview(job.submissions);
                  return (
                    <tr key={job.id}>
                      <td><div className="ov-project"><span className="ov-avatar" aria-hidden="true">{job.title.charAt(0).toUpperCase()}</span><div><strong>{job.title}</strong><span>Due {formatDate(job.deadline)}</span></div></div></td>
                      <td>{job.freelancer || "—"}</td>
                      <td>{formatAmount(job.amount, job.currency)}</td>
                      <td><span className={`pill pill-${pending ? "amber" : job.escrowConfirmed ? "green" : "muted"}`}><span className="dot" />{statusFor(job)}</span></td>
                      <td><Link to={next.to} className="row-link ov-link-arrow">{next.label} <ArrowUpRight size={15} /></Link></td>
                    </tr>
                  );
                })}
                {activeProjects.length === 0 && <tr><td colSpan="5"><p className="muted">No active projects yet.</p></td></tr>}
              </tbody>
            </table>
          </div>

          <div className="ov-bottom">
            <Card title="Recent activity">
              {activities.length ? (
                <ul className="ov-activity">
                  {activities.map(({ icon: Icon, title, meta }, index) => (
                    <li key={`${title}-${index}`}><Icon size={22} /><div><strong>{title}</strong><span>{meta}</span></div></li>
                  ))}
                </ul>
              ) : <p className="muted">Project and payment activity will appear here.</p>}
            </Card>
            <Card title="Agreements" className="ov-health">
              <div className="ov-health-value"><strong>{mutuallyApproved} / {agreementProjects.length}</strong><span>mutually approved</span></div>
              <p>{agreementProjects.length - mutuallyApproved} {agreementProjects.length - mutuallyApproved === 1 ? "agreement is" : "agreements are"} not yet mutually approved.</p>
              <div className="ov-health-foot"><Link to="/agreements" className="row-link ov-link-arrow">View agreements <ArrowRight size={16} /></Link></div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function Overview() {
  const { user } = useAuth();
  return user?.role === "FREELANCER"
    ? <FreelancerOverview user={user} />
    : <ClientOverview user={user} />;
}