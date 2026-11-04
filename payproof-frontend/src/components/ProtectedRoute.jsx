import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, checking, sessionExpired, backendUnavailable } = useAuth();
  const location = useLocation();

  // Don't flash protected pages while the first session check is running.
  if (checking) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          color: "var(--muted)",
        }}
      >
        Checking your session...
      </div>
    );
  }

  if (!isAuthenticated) {
    const notice = backendUnavailable
      ? "PayProof can't be reached right now. Please try again in a moment."
      : sessionExpired
        ? "Your session expired. Please sign in again."
        : undefined;

    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location, notice }}
      />
    );
  }

  return children;
}