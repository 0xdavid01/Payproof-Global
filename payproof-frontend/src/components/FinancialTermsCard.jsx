import { useEffect, useState } from "react";
import { Lock, Pencil } from "lucide-react";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { CURRENCIES } from "../services/currencies.js";
import { updateFinancialTerms } from "../services/jobService.js";
import { formatAmount, normalizeJob } from "../services/jobMapper.js";

// Client-only. Lets the client change the budget and currency until both parties approve.
export default function FinancialTermsCard({ job, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState(String(job.amount));
  const [currency, setCurrency] = useState(job.currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Keep the form in step with the job whenever it changes and we're not editing.
  useEffect(() => {
    if (!editing) {
      setBudget(String(job.amount));
      setCurrency(job.currency);
    }
  }, [job.amount, job.currency, editing]);

  const options = CURRENCIES.includes(job.currency) ? CURRENCIES : [job.currency, ...CURRENCIES];

  const save = async () => {
    setError("");
    const amount = Number(budget);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (amount === job.amount && currency === job.currency) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      const updated = await updateFinancialTerms(job.id, { budget: amount, currency });
      onUpdated(normalizeJob(updated), { hadContract: job.contract.exists });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Could not update the payment terms.");
    } finally {
      setBusy(false);
    }
  };

  if (job.termsLocked) {
    return (
      <Card title="Payment terms">
        <div className="terms-amount">{formatAmount(job.amount, job.currency)}</div>
        <p className="muted small terms-note">
          <Lock size={14} /> Locked. Both parties approved the agreement, so the amount and
          currency can't change.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Payment terms">
      {!editing ? (
        <>
          <div className="terms-amount">{formatAmount(job.amount, job.currency)}</div>
          <p className="muted small spaced-top">
            You can change this until both parties approve the agreement.
          </p>
          <div className="action-row spaced-top">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit terms
            </Button>
          </div>
        </>
      ) : (
        <div className="stack-sm">
          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label className="field-label" htmlFor="terms-budget">
              Amount
            </label>
            <div className="field-control">
              <input
                id="terms-budget"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="terms-currency">
              Currency
            </label>
            <div className="field-control">
              <select
                id="terms-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={busy}
              >
                {options.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {job.contract.exists && (
            <div className="callout callout-warn">
              Saving clears the current approvals. The freelancer will need to upload an updated
              agreement and both of you approve it again.
            </div>
          )}

          <div className="action-row">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save terms"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}