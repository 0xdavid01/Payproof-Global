export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "",
}) {
  return (
    <div className={`page-header ${className}`.trim()}>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}