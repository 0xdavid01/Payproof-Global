export const DECIMALS = { NEAR: 24, USDT: 6, USDC: 6 };

export function toRaw(amountStr, asset) {
  const d = DECIMALS[asset] ?? 24;
  const clean = String(amountStr).trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return '0';
  const [whole = '0', frac = ''] = clean.split('.');
  const padded = (frac + '0'.repeat(d)).slice(0, d);
  return BigInt((whole || '0') + padded).toString();
}

export function fromRaw(rawStr, asset, maxFrac = 6) {
  if (rawStr === null || rawStr === undefined || rawStr === '') return '0';
  const d = DECIMALS[asset] ?? 24;
  const padded = String(rawStr).padStart(d + 1, '0');
  const whole = padded.slice(0, -d);
  const frac = padded.slice(-d).slice(0, maxFrac).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export function splitMath(fundedRaw, freelancerRaw, feeBps) {
  const funded = BigInt(fundedRaw || '0');
  const fl = BigInt(freelancerRaw || '0');
  return {
    client: funded - fl,
    fee: (fl * BigInt(feeBps || 0)) / 10000n,
    valid: fl > 0n && fl <= funded,
  };
}

export const explorerTx = (hash) => `https://explorer.testnet.near.org/transactions/${hash}`;