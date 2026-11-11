import { useEffect, useState } from 'react';
import { chainApi } from '../services/api';
import { fromRaw } from '../services/units';
import StatusBadge from '../components/StatusBadge';

export default function ChainInfo() {
  const [config, setConfig] = useState(null);
  const [fees, setFees] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([chainApi.config(), chainApi.fees()])
      .then(([c, f]) => { setConfig(c); setFees(f); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Chain info</h1>
          <p className="muted">Platform configuration and accrued fees</p>
        </div>
        {config && <StatusBadge value={config.paused ? 'FAILED' : 'ACTIVE'} />}
      </header>

      {error && <div className="alert error">{error}</div>}

      {fees && (
        <div className="grid-3">
          <div className="card stat"><small className="muted">NEAR fees</small><strong>{fromRaw(fees.near, 'NEAR')}</strong></div>
          <div className="card stat"><small className="muted">USDT fees</small><strong>{fromRaw(fees.usdt, 'USDT')}</strong></div>
          <div className="card stat"><small className="muted">USDC fees</small><strong>{fromRaw(fees.usdc, 'USDC')}</strong></div>
        </div>
      )}

      {config && (
        <section className="card">
          <h3>Configuration</h3>
          {[
            ['Admin contract', config.admin_contract],
            ['Treasury', config.treasury],
            ['Dispute resolver', config.dispute_resolver],
            ['USDT contract', config.usdt_contract],
            ['USDC contract', config.usdc_contract],
            ['Platform fee', `${config.platform_fee_bps / 100}%`],
            ['Config version', config.config_version],
            ['Operation version', config.operation_version],
            ['Configured', config.configured ? 'Yes' : 'No'],
            ['Paused', config.paused ? 'Yes' : 'No'],
            ['Pending withdrawal', fees?.pending_withdrawal ? 'Yes' : 'No'],
          ].map(([k, v]) => (
            <div className="row" key={k}><span className="muted">{k}</span><span className="mono">{v}</span></div>
          ))}
        </section>
      )}
    </>
  );
}