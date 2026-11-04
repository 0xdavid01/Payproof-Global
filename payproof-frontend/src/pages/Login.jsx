import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/TextField.jsx";
import SocialAuth from "../components/SocialAuth.jsx";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { resendLoginOtp, startGoogleLogin } from "../services/authService.js";

const OTP_LENGTH = 6;

export default function Login() {
  const { login, verifyLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [resendNotice, setResendNotice] = useState("");
  const otpInputs = useRef([]);

  const notice = location.state?.notice;
  const redirectTo = location.state?.from?.pathname || "/overview";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (otpStep) {
        await verifyLoginOtp(email.trim(), otp.join(""));
        navigate(redirectTo, { replace: true });
      } else {
        const result = await login(email.trim(), password);
        if (result?.requiresOtp) {
          setOtpStep(true);
          setOtp(Array(OTP_LENGTH).fill(""));
          setResendNotice("");
          window.setTimeout(() => otpInputs.current[0]?.focus(), 0);
        } else {
          navigate(redirectTo, { replace: true });
        }
      }
    } catch (err) {
      setError(
        err.message ||
          (otpStep ? "That code could not be verified. Try again." : "Could not sign in. Check your details and try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  const setOtpDigit = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((current) => current.map((item, position) => (position === index ? digit : item)));
    if (digit && index < OTP_LENGTH - 1) otpInputs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      otpInputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    event.preventDefault();
    setOtp(Array.from({ length: OTP_LENGTH }, (_, index) => digits[index] || ""));
    otpInputs.current[Math.min(digits.length, OTP_LENGTH) - 1]?.focus();
  };

  const handleResend = async () => {
    setError("");
    setResendNotice("");
    setLoading(true);
    try {
      await resendLoginOtp(email.trim());
      setResendNotice("A new code is on its way to your inbox.");
    } catch (err) {
      setError(err.message || "Could not resend your code. Please try again.");
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
      eyebrow={otpStep ? "Verify your email" : "Welcome back"}
      title={otpStep ? "Check your inbox." : "Good to see you again."}
      subtitle={
        otpStep
          ? <>We sent a 6-digit sign-in code to <strong>{email.trim()}</strong>. Enter it below to continue.</>
          : "Sign in to your projects, agreements and payments."
      }
    >
      {!otpStep && (
        <SocialAuth
          googleLabel="Continue with Google"
          onGoogle={handleGoogle}
          onWallet={handleWallet}
          disabled={loading}
        />
      )}

      <form onSubmit={handleSubmit} className={`auth-form${otpStep ? " otp-form" : ""}`}>
        {notice && <div className="form-notice">{notice}</div>}
        {error && <div className="form-error">{error}</div>}

        {!otpStep ? (
          <>
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
          </>
        ) : (
          <>
            <div className="otp-inputs" role="group" aria-label="6-digit verification code">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { otpInputs.current[index] = element; }}
                  className="otp-digit"
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                  onChange={(event) => setOtpDigit(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  onPaste={handleOtpPaste}
                  required
                />
              ))}
            </div>
            {resendNotice && <p className="otp-resend-notice" role="status">{resendNotice}</p>}
            <div className="otp-actions">
              <button type="button" className="otp-text-button" onClick={handleResend} disabled={loading}>
                Resend code
              </button>
              <button
                type="button"
                className="otp-text-button"
                onClick={() => { setOtpStep(false); setOtp(Array(OTP_LENGTH).fill("")); setError(""); }}
              >
                Change sign-in details
              </button>
            </div>
          </>
        )}

        <Button type="submit" block icon={ArrowRight} disabled={loading}>
          {loading ? (otpStep ? "Verifying..." : "Signing in...") : (otpStep ? "Verify and continue" : "Sign in")}
        </Button>
      </form>

      {!otpStep && (
        <p className="auth-switch">
          New to PayProof? <Link to="/register">Create an account</Link>
        </p>
      )}
    </AuthLayout>
  );
}