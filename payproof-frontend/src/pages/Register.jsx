import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, PenTool } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/TextField.jsx";
import SocialAuth from "../components/SocialAuth.jsx";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { register, startGoogleLogin } from "../services/authService.js";

const ROLES = [
  { value: "FREELANCER", label: "Freelancer", hint: "Do work. Get paid.", icon: PenTool },
  { value: "CLIENT", label: "Client", hint: "Hire. Build together.", icon: Briefcase },
];

function passwordProblem(pw) {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (!/\d/.test(pw)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include a symbol.";
  return "";
}

export default function Register() {
  const { login, saveUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    role: "FREELANCER",
    email: "",
    password: "",
    agree: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();

    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      return;
    }
    const pwError = passwordProblem(form.password);
    if (pwError) {
      setError(pwError);
      return;
    }
    if (!form.agree) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      const email = form.email.trim();
      await register({ firstName, lastName, email, password: form.password, role: form.role });

      try {
        // Sign in straight away so the user lands in the app.
        const signedIn = await login(email, form.password);
        saveUser({ ...signedIn, firstName, lastName, role: form.role });
        navigate("/overview", { replace: true });
      } catch {
        navigate("/login", {
          replace: true,
          state: { notice: "Account created. Sign in to continue." },
        });
      }
    } catch (err) {
      setError(err.message || "Could not create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await startGoogleLogin(form.role);
    } catch (err) {
      setError(err.message || "Google sign-up is unavailable right now.");
    }
  };

  const handleWallet = () => {
    setError("NEAR wallet sign-up isn't available yet.");
  };

  return (
    <AuthLayout
      eyebrow="Start protected"
      title="Create your account"
      subtitle="Your next great collaboration starts here."
    >
      <SocialAuth
        googleLabel="Sign up with Google"
        onGoogle={handleGoogle}
        onWallet={handleWallet}
        disabled={loading}
      />

      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="form-error">{error}</div>}

        <div className="form-grid-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={set("firstName")}
            required
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={set("lastName")}
            required
          />
        </div>

        <div className="field">
          <span className="field-label">I'm here as a</span>
          <div className="role-grid">
            {ROLES.map(({ value, label, hint, icon: Icon }) => {
              const selected = form.role === value;
              return (
                <button
                  type="button"
                  key={value}
                  className={`role-card${selected ? " selected" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, role: value }))}
                  aria-pressed={selected}
                >
                  <span className="role-card-top">
                    <Icon size={24} />
                    <span className="role-radio" />
                  </span>
                  <strong>{label}</strong>
                  <span className="role-hint">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          required
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters, including a number and symbol."
          value={form.password}
          onChange={set("password")}
          required
        />

        <label className="check">
          <input
            type="checkbox"
            checked={form.agree}
            onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked }))}
          />
          I agree to the Terms of Service and Privacy Policy.
        </label>

        <Button type="submit" block icon={ArrowRight} disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}