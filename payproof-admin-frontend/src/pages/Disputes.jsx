import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { disputesApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';

export default function Disputes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    disputesApi
      .list()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.escrowId, r.jobTitle, r.clientEmail, r.freelancerEmail, r.caseReason].some((v) => (v || '').toLowerCase().includes(s))
    );
  }, [rows, q]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Open disputes</h1>
          <p className="muted">{rows.length} awaiting resolution</p>
        </div>
        <div className="head-actions">
          <input className="search" placeholder="Search escrow, job, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-ghost" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Escrow</th><th>Job</th><th>Reason</th><th>Amount</th><th>Opened</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan="6" className="empty">No open disputes 🎉</td></tr>}
            {filtered.map((r) => (
              <tr key={r.caseId} className="clickable" onClick={() => navigate(`/disputes/${r.escrowId}`)}>
                <td className="mono">{r.escrowId.slice(0, 14)}…</td>
                <td>
                  <strong>{r.jobTitle}</strong>
                  <small className="muted block">{r.clientEmail} ↔ {r.freelancerEmail}</small>
                </td>
                <td className="clip">{r.caseReason}</td>
                <td>{r.budget} {r.currency}</td>
                <td>{new Date(r.caseCreatedAt).toLocaleString()}</td>
                <td><StatusBadge value={r.localProposalStatus || r.onChainEscrow?.status || r.caseStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}