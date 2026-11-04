import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/TextField.jsx";
import SocialAuth from "../components/SocialAuth.jsx";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { startGoogleLogin } from "../services/authService.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const notice = location.state?.notice;
  const redirectTo = location.state?.from?.pathname || "/overview";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  // The Google endpoint needs a role and this screen has no role picker.
  // Defaulting to CLIENT; see note in the chat.
  const handleGoogle = async () => {
    setError("");
    try {
      await startGoogleLogin("CLIENT");
    } catch (err) {
      setError(err.message || "Google sign-in is unavailable right now.");
    }
  };

  const handleWallet = () => {
    setError("NEAR wallet sign-in isn't available yet.");
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Good to see you again."
      subtitle="Sign in to your projects, agreements and payments."
    >
      <SocialAuth
        googleLabel="Continue with Google"
        onGoogle={handleGoogle}
        onWallet={handleWallet}
        disabled={loading}
      />

      <form onSubmit={handleSubmit} className="auth-form">
        {notice && <div className="form-notice">{notice}</div>}
        {error && <div className="form-error">{error}</div>}

        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="auth-row">
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <a href="#forgot" className="link-green" onClick={(e) => e.preventDefault()}>
            Forgot password?
          </a>
        </div>

        <Button type="submit" block icon={ArrowRight} disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="auth-switch">
        New to PayProof? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}