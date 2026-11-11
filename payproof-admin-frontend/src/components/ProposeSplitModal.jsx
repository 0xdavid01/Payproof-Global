import { useState } from 'react';
import Modal from './Modal';
import { disputesApi } from '../services/api';
import { fromRaw, toRaw, splitMath, explorerTx } from '../services/units';

export default function ProposeSplitModal({ escrowId, asset, fundedRaw, feeBps, onDone, onClose }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const flRaw = toRaw(amount || '0', asset);
  const { client, fee, valid } = splitMath(fundedRaw, flRaw, feeBps);
  const ready = valid && reason.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await disputesApi.propose(escrowId, flRaw, reason.trim());
      setResult(res);
      onDone();
    } catch (err) {
      setError([err.message, ...(err.details || [])].join(' · '));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Proposal submitted" onClose={onClose}>
        <div className="alert success">Split proposed on-chain. Waiting for both parties to accept.</div>
        <p className="muted">Transaction</p>
        <a className="mono" href={explorerTx(result.proposeTxHash)} target="_blank" rel="noreferrer">
          {result.proposeTxHash}
        </a>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Propose split" onClose={onClose}>
      <div className="summary-row">
        <span>Funded amount</span>
        <strong>{fromRaw(fundedRaw, asset)} {asset}</strong>
      </div>
      <label className="field">
        <span>Freelancer gets ({asset})</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.6" />
      </label>
      <div className="split-preview">
        <div><small>Client gets</small><strong>{valid ? fromRaw(client.toString(), asset) : '—'}</strong></div>
        <div><small>Platform fee ({feeBps / 100}%)</small><strong>{valid ? fromRaw(fee.toString(), asset) : '—'}</strong></div>
      </div>
      {amount && !valid && <div className="alert error">Amount must be above 0 and not exceed the funded amount.</div>}
      <label className="field">
        <span>Reason</span>
        <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        <small className="muted">{reason.length}/500</small>
      </label>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Back</button>
        <button className="btn btn-primary" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Signing…' : 'Submit proposal'}
        </button>
      </div>
    </Modal>
  );
}