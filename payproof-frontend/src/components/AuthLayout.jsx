import { Link } from "react-router-dom";
import { ArrowLeft, CircleCheck, Lock, ShieldCheck } from "lucide-react";
import Logo from "./Logo.jsx";

const POINTS = [
  "Agree on the scope together",
  "Secure payment before work starts",
  "Keep proof in one place",
];

export default function AuthLayout({ eyebrow, title, subtitle, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo to="/" />

        <div className="auth-aside-body">
          <div className="eyebrow eyebrow-green">A stronger foundation for work</div>
          <h2 className="auth-hero">Good work starts with trust.</h2>
          <p className="auth-hero-sub">
            Clear agreements. Client-funded escrow. A shared record from the first brief to
            the last payment.
          </p>

          <div className="auth-aside-card">
            <span className="auth-aside-icon">
              <ShieldCheck size={28} />
            </span>
            <h3>
              Less uncertainty.
              <br />
              More moving forward.
            </h3>
            <ul>
              {POINTS.map((p) => (
                <li key={p}>
                  <CircleCheck size={22} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="auth-aside-foot">Built on NEAR Protocol · Your wallet stays yours.</p>
      </aside>

      <section className="auth-main">
        <div className="auth-main-inner">
          <div className="auth-topline">
            <Link to="/" className="auth-back">
              <ArrowLeft size={16} /> Back to PayProof
            </Link>
            <a href="#help" className="auth-help">
              Need help?
            </a>
          </div>

          <div className="auth-form-wrap">
            <div className="eyebrow eyebrow-green">{eyebrow}</div>
            <h1 className="auth-title">{title}</h1>
            <p className="auth-subtitle">{subtitle}</p>

            {children}
          </div>

          <div className="auth-foot">
            <p className="auth-foot-line">
              <Lock size={16} /> We never ask for your wallet's seed phrase or private key.
            </p>
            <p className="auth-copy">© 2026 PayProof · Protected work, by agreement.</p>
          </div>
        </div>
      </section>
    </div>
  );
}