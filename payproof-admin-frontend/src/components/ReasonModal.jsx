import { useState } from 'react';
import Modal from './Modal';

export default function ReasonModal({ title, confirmLabel, withUserId, danger, onSubmit, onClose }) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const max = withUserId ? 1000 : 500;
  const ready = reason.trim() && (!withUserId || userId.trim());

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit({ userId: userId.trim(), reason: reason.trim() });
      onClose();
    } catch (err) {
      setError([err.message, ...(err.details || [])].join(' · '));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      {withUserId && (
        <label className="field">
          <span>User ID</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="USER-c1" />
        </label>
      )}
      <label className="field">
        <span>Reason</span>
        <textarea rows={4} maxLength={max} value={reason} onChange={(e) => setReason(e.target.value)} />
        <small className="muted">{reason.length}/{max}</small>
      </label>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Back</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}