import { useEffect, useMemo, useState } from 'react';
import { bansApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import ReasonModal from '../components/ReasonModal';
import Modal from '../components/Modal';

export default function Bans() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // {type:'ban'|'unban'|'history', user?}
  const [history, setHistory] = useState([]);

  const load = () => {
    setLoading(true);
    bansApi
      .list()
      .then((r) => { setRows(r); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.userId, r.email, r.displayName].some((v) => (v || '').toLowerCase().includes(s)));
  }, [rows, q]);

  const openHistory = async (user) => {
    setModal({ type: 'history', user });
    setHistory([]);
    try {
      setHistory(await bansApi.history(user.userId));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Suspended users</h1>
          <p className="muted">{rows.length} currently banned</p>
        </div>
        <div className="head-actions">
          <input className="search" placeholder="Search user ID or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-danger" onClick={() => setModal({ type: 'ban' })}>Ban user</button>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Since</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan="5" className="empty">No suspended users.</td></tr>}
            {filtered.map((u) => (
              <tr key={u.userId}>
                <td>
                  <strong>{u.displayName}</strong>
                  <small className="muted block">{u.email} · <span className="mono">{u.userId}</span></small>
                </td>
                <td>{u.role}</td>
                <td><StatusBadge value={u.status} /></td>
                <td>{new Date(u.updatedAt).toLocaleString()}</td>
                <td className="right">
                  <button className="btn btn-ghost" onClick={() => openHistory(u)}>History</button>{' '}
                  <button className="btn btn-primary" onClick={() => setModal({ type: 'unban', user: u })}>Unban</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.type === 'ban' && (
        <ReasonModal
          title="Ban user"
          confirmLabel="Ban user"
          withUserId
          danger
          onSubmit={async ({ userId, reason }) => {
            await bansApi.ban(userId, reason);
            load();
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'unban' && (
        <ReasonModal
          title={`Unban ${modal.user.displayName}`}
          confirmLabel="Unban"
          onSubmit={async ({ reason }) => {
            await bansApi.unban(modal.user.userId, reason);
            load();
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'history' && (
        <Modal title={`History · ${modal.user.displayName}`} onClose={() => setModal(null)} wide>
          {history.length === 0 && <p className="muted">No audit entries.</p>}
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.auditId}>
                <StatusBadge value={h.action} />
                <div>
                  <p>{h.reason}</p>
                  <small className="muted">{new Date(h.performedAt).toLocaleString()} · by {h.performedByAdminId}</small>
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}