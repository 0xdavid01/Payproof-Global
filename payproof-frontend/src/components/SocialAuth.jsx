import { Wallet } from "lucide-react";
import GoogleIcon from "./GoogleIcon.jsx";

export default function SocialAuth({ googleLabel, onGoogle, onWallet, disabled }) {
  return (
    <>
      <div className="social-stack">
        <button type="button" className="social-btn" onClick={onGoogle} disabled={disabled}>
          <GoogleIcon />
          {googleLabel}
        </button>
        <button type="button" className="social-btn" onClick={onWallet} disabled={disabled}>
          <Wallet size={20} />
          Continue with NEAR wallet
        </button>
      </div>
      <p className="social-note">Signing in with a wallet does not move any funds.</p>

      <div className="divider">
        <span>or use email</span>
      </div>
    </>
  );
}