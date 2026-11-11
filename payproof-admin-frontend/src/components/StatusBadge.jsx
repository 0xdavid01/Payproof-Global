const TONES = {
  OPEN: 'amber',
  DISPUTED: 'red',
  FAILED: 'red',
  CANCELLED: 'gray',
  RELEASED: 'green',
  APPROVED: 'green',
  ACCEPTED: 'green',
  ACTIVE: 'green',
  SUSPENDED: 'red',
  BAN: 'red',
  UNBAN: 'green',
  CHANGES_REQUESTED: 'amber',
  PENDING: 'amber',
};

export default function StatusBadge({ value }) {
  if (!value) return <span className="badge gray">—</span>;
  const tone = TONES[String(value).toUpperCase()] || 'gray';
  return <span className={`badge ${tone}`}>{String(value).replace(/_/g, ' ')}</span>;
}