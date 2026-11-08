import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CircleCheck, Send, ShieldCheck } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import TextField from "../components/TextField.jsx";
import FileDropzone from "../components/FileDropzone.jsx";
import ProjectChecklist from "../components/ProjectChecklist.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { createJob, uploadPrd, approveChecklist } from "../services/jobService.js";
import { getJobId, getRequirements } from "../services/jobMapper.js";
import { CURRENCIES, DEFAULT_CURRENCY } from "../services/currencies.js";
import { calculatePlatformFee } from "../services/fees.js";

const NEXT_STEPS = [
  { title: "Freelancer reviews the PRD", text: "They accept or decline the invitation." },
  { title: "You agree on the terms", text: "Upload a contract or review the freelancer's agreement." },
  { title: "You fund the escrow", text: "Work starts after the deposit is confirmed." },
];

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatNumber(n, maximumFractionDigits = 4) {
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits })
    : "0";
}

function prettyToday() {
  return new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

export default function CreateProject() {
  const { user } = useAuth();
  const { address, isConnected, loading: walletLoading, busy: walletBusy, connect } = useWallet();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    description: "",
    amount: "",
    currency: DEFAULT_CURRENCY,
    deadline: "",
    email: "",
  });
  const [file, setFile] = useState(null);

  const [stage, setStage] = useState("form"); // "form" | "review"
  const [phase, setPhase] = useState(""); // "checking-wallet" | "creating" | "uploading" | "approving" | ""
  const [jobId, setJobId] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const busy = phase !== "";
  const locked = !!jobId; // once the job exists the details can no longer be edited here

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const amount = Number(form.amount);
  const fee = calculatePlatformFee(amount);

  if (user?.role === "FREELANCER") {
    return (
      <>
        <PageHeader eyebrow="Projects / New project" title="Clients create projects." />
        <Card>
          You're signed in as a freelancer. Clients create projects and invite freelancers.
          Invitations you receive will appear in Projects.
        </Card>
      </>
    );
  }

  const validate = () => {
    if (!form.name.trim()) return "Give your project a name.";
    if (!form.description.trim()) return "Add a short description.";
    if (!/^\d+(?:\.\d*)?$/.test(form.amount.trim())) {
      return "Enter a valid project amount.";
    }
    if (!amount || amount <= 0) return "Enter a project amount greater than 0.";
    if (!CURRENCIES.includes(form.currency)) return "Choose a supported currency.";
    const decimalPlaces = form.amount.split(".")[1]?.length ?? 0;
    const maxDecimalPlaces = form.currency === "NEAR" ? 8 : 6;
    if (decimalPlaces > maxDecimalPlaces) {
      return `${form.currency} supports up to ${maxDecimalPlaces} decimal places.`;
    }
    if (!form.deadline) return "Pick a target delivery date.";
    if (form.deadline < todayISO()) return "The delivery date can't be in the past.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Enter a valid freelancer email.";
    if (!file) return "Upload your PRD.";
    return "";
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setError("");

    if (walletLoading) {
      setError("Please wait while we check your linked wallet.");
      return;
    }

    if (!isConnected || !address) {
      setError("Connect and link your client NEAR wallet before creating a project.");
      return;
    }

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    try {
      setPhase("checking-wallet");
      const { ensureWalletSessionMatches } = await import("../services/nearWallet.js");
      await ensureWalletSessionMatches(address);
      let id = jobId;

      // 1. Create the job (skipped when retrying after a failed PRD upload).
      if (!id) {
        setPhase("creating");
        const created = await createJob({
          title: form.name.trim(),
          description: form.description.trim(),
          budget: form.currency === "NEAR" ? amount : form.amount,
          currency: form.currency,
          deadline: `${form.deadline}T18:00:00`,
          participantEmail: form.email.trim(),
        });
        id = getJobId(created);
        if (!id) throw new Error("The project was created but the response had no job ID.");
        setJobId(id);
      }

      // 2. Upload the PRD. The backend extracts the text and generates the checklist.
      setPhase("uploading");
      let updated;
      try {
        updated = await uploadPrd(id, file);
      } catch (err) {
        setError(
          `Your project was created, but the PRD upload failed: ${err.message} ` +
            "Press the button again to retry the upload."
        );
        setPhase("");
        return;
      }

      // 3. Show the AI checklist for review.
      setItems(
        getRequirements(updated).map((r, i) => ({
          id: `ai-${i}`,
          isDone: false,
          condition: r.condition,
        }))
      );
      setStage("review");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setPhase("");
    }
  };

  const handleApprove = async () => {
    setError("");
    const cleaned = items
      .map((it) => ({ isDone: false, condition: it.condition.trim() }))
      .filter((it) => it.condition);

    if (cleaned.length === 0) {
      setError("Add at least one requirement before approving.");
      return;
    }

    setPhase("approving");
    try {
      await approveChecklist(jobId, cleaned);
      navigate("/projects", { replace: true });
    } catch (err) {
      setError(err.message || "Could not approve the checklist. Please try again.");
    } finally {
      setPhase("");
    }
  };

  const sendLabel =
    phase === "checking-wallet"
      ? "Checking wallet..."
      : phase === "creating"
      ? "Creating project..."
      : phase === "uploading"
      ? "Reading your PRD and building the checklist..."
      : jobId
      ? "Retry PRD upload"
      : "Send invitation";

  return (
    <>
      <PageHeader
        eyebrow={`Projects / New project${stage === "review" ? " / Checklist" : ""} · ${prettyToday()}`}
        title={stage === "review" ? "Review your checklist." : "Start on the same page."}
        subtitle={
          stage === "review"
            ? "We turned your PRD into acceptance criteria. Edit anything, then approve."
            : "Give your freelancer a clear brief. No agreement or payment is required to send an invitation."
        }
      />

      <div className="project-grid">
        {/* ---------------- left column ---------------- */}
        {stage === "form" ? (
          <form className="stack" onSubmit={handleSend}>
            {error && <div className="form-error">{error}</div>}

            <Card title="Project details">
              <div className="stack-sm">
                <TextField
                  label="Project name"
                  value={form.name}
                  onChange={set("name")}
                  disabled={locked || busy}
                  required
                />

                <div className="field">
                  <label className="field-label" htmlFor="project-description">
                    Project description
                  </label>
                  <div className="field-control">
                    <textarea
                      id="project-description"
                      rows={5}
                      value={form.description}
                      onChange={set("description")}
                      disabled={locked || busy}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <TextField
                    label="Project amount"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={set("amount")}
                    disabled={locked || busy}
                    hint={`Platform fee is added at funding. ${form.currency} supports up to ${form.currency === "NEAR" ? 8 : 6} decimal places.`}
                    required
                  />

                  <div className="field">
                    <label className="field-label" htmlFor="project-currency">
                      Currency
                    </label>
                    <div className="field-control">
                      <select
                        id="project-currency"
                        value={form.currency}
                        onChange={set("currency")}
                        disabled={locked || busy}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <TextField
                  label="Target delivery date"
                  type="date"
                  min={todayISO()}
                  value={form.deadline}
                  onChange={set("deadline")}
                  disabled={locked || busy}
                  required
                />
              </div>
            </Card>

            <Card title="Project requirements document">
              <p className="card-lead">
                Include deliverables, references and acceptance criteria. We read this PRD and
                build your acceptance checklist from it.
              </p>
              <FileDropzone file={file} onChange={setFile} disabled={busy} />
            </Card>

            <Card title="Invite your freelancer">
              <TextField
                label="Freelancer email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={set("email")}
                disabled={locked || busy}
                hint="They will receive the project details and can accept or decline before the agreement stage begins."
                required
              />
            </Card>

            <div className="action-row">
              <Button type="submit" icon={Send} disabled={busy}>
                {sendLabel}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled
                title="Drafts aren't supported by the backend yet"
              >
                Save draft
              </Button>
            </div>
            {(!isConnected || (error && /wallet|account/i.test(error))) && (
              <p className="muted small">
                {isConnected
                  ? "Reconnect the NEAR wallet linked to your client account. "
                  : "Connect your client NEAR wallet before creating a project. "}
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
          </form>
        ) : (
          <div className="stack">
            {error && <div className="form-error">{error}</div>}

            <Card className="project-checklist-review-card">
              <ProjectChecklist
                requirements={items}
                mode="review"
                onChange={setItems}
                disabled={busy}
              />
            </Card>

            <div className="action-row">
              <Button icon={Check} onClick={handleApprove} disabled={busy}>
                {phase === "approving" ? "Approving..." : "Approve checklist"}
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- right column ---------------- */}
        <aside className="stack">
          <Card title="Your project at a glance">
            <p className="status-line">
              <span className="dot dot-muted" />
              {stage === "review" ? "Invitation sent · Checklist pending" : "Draft · Not sent"}
            </p>
            <div className="kv">
              <span>Project amount</span>
              <strong>
                {formatNumber(amount || 0, form.currency === "NEAR" ? 4 : 6)} {form.currency}
              </strong>
            </div>
            <div className="kv">
              <span>Platform fee · 3.5%</span>
              <strong>
                {formatNumber(fee, form.currency === "NEAR" ? 4 : 6)} {form.currency}
              </strong>
            </div>
            <hr className="rule" />
            <div className="kv kv-big">
              <span>Due today</span>
              <strong>0 {form.currency}</strong>
            </div>
            <p className="muted small">
              Funding opens only after you and your freelancer approve the same final agreement.
            </p>
          </Card>

          <Card title="What happens next">
            <ul className="next-list">
              {NEXT_STEPS.map((s) => (
                <li key={s.title}>
                  <CircleCheck size={22} />
                  <div>
                    <strong>{s.title}</strong>
                    <span className="muted">{s.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="callout callout-row">
            <ShieldCheck size={22} />
            <div>
              <strong>Your brief is private</strong>
              <p>Only invited collaborators can access this project and its files.</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}