import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { disputesApi } from '../services/api';
import { fromRaw, explorerTx } from '../services/units';
import StatusBadge from '../components/StatusBadge';
import ProposeSplitModal from '../components/ProposeSplitModal';
import ReasonModal from '../components/ReasonModal';

const POLL_MS = 10000;

export default function DisputeDetail() {
  const { escrowId } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await disputesApi.dossier(escrowId);
      setD(data);
      setError('');
    } catch (e) {
      if (e.status === 404) return navigate('/disputes', { replace: true });
      setError(e.message);
    }
  }, [escrowId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const chain = d?.onChainEscrow;
  const proposal = d?.onChainProposal;
  const finished =
    chain?.status === 'Released' || (proposal?.client_accepted && proposal?.freelancer_accepted);

  useEffect(() => {
    clearInterval(timer.current);
    if (d && !finished) timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [d, finished, load]);

  if (!d) {
    return error ? <div className="alert error">{error}</div> : <div className="splash">Loading dossier…</div>;
  }

  const job = d.job;
  const asset = job.currency;
  const feeBps = chain?.platform_fee_bps ?? 0;
  const local = d.localProposalStatus;
  const canPropose = chain?.status === 'Disputed' && !proposal;
  const canCancel = local === 'OPEN';
  const canRetry = local === 'FAILED';

  const retry = async () => {
    setBusy(true);
    try {
      await disputesApi.retry(escrowId);
      setNotice('Settlement retry started.');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/disputes" className="back">← All disputes</Link>
      <header className="page-head">
        <div>
          <h1>{job.title}</h1>
          <p className="muted mono">{d.caseView.escrowId}</p>
        </div>
        <div className="head-actions">
          <StatusBadge value={local || chain?.status} />
          <button className="btn btn-ghost" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="grid-3">
        <Stat label="Budget" value={`${job.budget} ${asset}`} />
        <Stat label="Funded on-chain" value={chain ? `${fromRaw(chain.funded_amount, asset)} ${asset}` : '—'} />
        <Stat label="Case opened" value={new Date(d.caseView.caseCreatedAt).toLocaleString()} />
      </div>

      <section className="card">
        <h3>Dispute reason</h3>
        <p>{d.caseView.caseReason}</p>
        {d.caseView.caseTransactionHash && (
          <a className="mono small" href={explorerTx(d.caseView.caseTransactionHash)} target="_blank" rel="noreferrer">
            {d.caseView.caseTransactionHash}
          </a>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <h3>Parties</h3>
          <Party role="Client" p={job.client} />
          <Party role="Freelancer" p={job.freelancer} />
        </section>
        <section className="card">
          <h3>Contract & brief</h3>
          <Row k="Deadline" v={job.deadline ? new Date(job.deadline).toLocaleDateString() : '—'} />
          <Row k="Contract" v={<><StatusBadge value={job.contractStatus} /> v{job.contractVersion}</>} />
          <Row k="Approved by" v={`client v${job.clientApprovedContractVersion ?? '—'} · freelancer v${job.freelancerApprovedContractVersion ?? '—'}`} />
          <div className="link-row">
            {job.prdUrl && <a className="btn btn-ghost" href={job.prdUrl} target="_blank" rel="noreferrer">Open PRD</a>}
            {job.contractUrl && <a className="btn btn-ghost" href={job.contractUrl} target="_blank" rel="noreferrer">Open contract</a>}
          </div>
        </section>
      </div>

      <section className="card">
        <h3>Description</h3>
        <p className="prewrap">{job.description}</p>
      </section>

      <section className="card">
        <h3>Requirements</h3>
        {(job.requirements || []).length === 0 && <p className="muted">No requirements recorded.</p>}
        <ul className="checklist">
          {(job.requirements || []).map((r) => (
            <li key={r.position} className={r.isDone ? 'done' : ''}>
              <span className="tick">{r.isDone ? '✓' : ''}</span>
              {r.condition}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Submissions</h3>
        {d.submissions.length === 0 && <div className="alert warn">The freelancer never submitted work.</div>}
        {d.submissions.map((s) => (
          <div key={s.submissionId} className="submission">
            <div className="submission-head">
              <strong>Submission</strong>
              <StatusBadge value={s.submissionStatus} />
              <small className="muted">current v{s.currentVersionNumber}</small>
            </div>
            {s.versions.map((v) => (
              <details key={v.versionId} className="version" open={v.versionNumber === s.currentVersionNumber}>
                <summary>
                  <span>Version {v.versionNumber}</span>
                  <StatusBadge value={v.status} />
                  <small className="muted">{new Date(v.submittedAt).toLocaleString()}</small>
                </summary>
                <div className="version-body">
                  {v.fileName && (
                    <a className="btn btn-ghost" href={v.downloadUrl} target="_blank" rel="noreferrer">
                      ⬇ {v.fileName} {v.fileSizeBytes ? `(${(v.fileSizeBytes / 1048576).toFixed(1)} MB)` : ''}
                    </a>
                  )}
                  {v.externalUrl && <a href={v.externalUrl} target="_blank" rel="noreferrer">{v.externalUrl}</a>}
                  {v.notes && <p className="note"><small className="muted">Freelancer notes</small>{v.notes}</p>}
                  {v.review && (
                    <p className="note">
                      <small className="muted">Client review · {new Date(v.review.reviewedAt).toLocaleString()}</small>
                      <StatusBadge value={v.review.status} /> {v.review.feedback}
                    </p>
                  )}
                  <table className="table compact">
                    <thead><tr><th>Requirement</th><th>Marked done</th><th>Review</th></tr></thead>
                    <tbody>
                      {(v.requirements || []).map((r) => (
                        <tr key={r.position}>
                          <td>{r.condition}{r.reviewFeedback && <small className="muted block">{r.reviewFeedback}</small>}</td>
                          <td>{r.completed ? 'Yes' : 'No'}</td>
                          <td><StatusBadge value={r.reviewStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        ))}
      </section>

      <section className="card">
        <h3>On-chain state</h3>
        {chain ? (
          <>
            <Row k="Status" v={<StatusBadge value={chain.status} />} />
            <Row k="Amount" v={`${fromRaw(chain.amount, asset)} ${asset}`} />
            <Row k="Funded" v={`${fromRaw(chain.funded_amount, asset)} ${asset}`} />
            <Row k="Platform fee" v={`${feeBps / 100}%`} />
            <Row k="Client wallet" v={<span className="mono">{chain.client}</span>} />
            <Row k="Freelancer wallet" v={<span className="mono">{chain.freelancer}</span>} />
          </>
        ) : (
          <p className="muted">No on-chain data.</p>
        )}
        {proposal && (
          <div className="proposal">
            <h4>Open proposal</h4>
            <div className="split-preview">
              <div><small>Freelancer</small><strong>{fromRaw(proposal.freelancer_amount, asset)}</strong></div>
              <div><small>Client</small><strong>{fromRaw(proposal.client_amount, asset)}</strong></div>
              <div><small>Fee</small><strong>{fromRaw(proposal.fee, asset)}</strong></div>
            </div>
            <div className="accepts">
              <span className={proposal.client_accepted ? 'yes' : ''}>{proposal.client_accepted ? '✓' : '…'} Client accepted</span>
              <span className={proposal.freelancer_accepted ? 'yes' : ''}>{proposal.freelancer_accepted ? '✓' : '…'} Freelancer accepted</span>
            </div>
          </div>
        )}
        {finished && <div className="alert success">Resolved. Auto-refresh stopped.</div>}
      </section>

      <div className="action-bar">
        {canPropose && <button className="btn btn-primary" onClick={() => setModal('propose')}>Propose split</button>}
        {canCancel && <button className="btn btn-danger" onClick={() => setModal('cancel')}>Cancel proposal</button>}
        {canRetry && <button className="btn btn-primary" disabled={busy} onClick={retry}>Retry settlement</button>}
        {!canPropose && !canCancel && !canRetry && <span className="muted">No actions available right now.</span>}
      </div>

      {modal === 'propose' && (
        <ProposeSplitModal
          escrowId={escrowId}
          asset={asset}
          fundedRaw={chain.funded_amount}
          feeBps={feeBps}
          onDone={load}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'cancel' && (
        <ReasonModal
          title="Cancel proposal"
          confirmLabel="Cancel proposal"
          danger
          onSubmit={async ({ reason }) => {
            await disputesApi.cancel(escrowId, reason);
            setNotice('Proposal cancelled.');
            load();
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

const Stat = ({ label, value }) => (
  <div className="card stat"><small className="muted">{label}</small><strong>{value}</strong></div>
);
const Row = ({ k, v }) => (
  <div className="row"><span className="muted">{k}</span><span>{v}</span></div>
);
const Party = ({ role, p }) => (
  <div className="party">
    <small className="muted">{role}</small>
    <strong>{p?.displayName}</strong>
    <span>{p?.email}</span>
    <span className="mono small">{p?.userId}</span>
  </div>
);