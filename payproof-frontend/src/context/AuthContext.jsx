import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as authService from "../services/authService.js";

const AuthContext = createContext(null);
const STORAGE_KEY = "payproof_user";
const RECHECK_MS = 5 * 60 * 1000;
const FOCUS_THROTTLE_MS = 30 * 1000;
const NETWORK_RECHECK_MS = 10 * 1000;

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [checking, setChecking] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const userRef = useRef(user);
  const lastCheck = useRef(0);
  const lastNetworkCheck = useRef(0);

  const saveUser = useCallback((next) => {
    userRef.current = next;
    setUser(next);

    try {
      if (next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Keep the user in memory if browser storage is unavailable.
    }
  }, []);

  // Signs the user out locally. ProtectedRoute then sends them to the login page and
  // shows the reason. reason: "expired" | "unavailable"
  const endSession = useCallback(
    (reason) => {
      if (userRef.current) {
        if (reason === "expired") setSessionExpired(true);
        if (reason === "unavailable") setBackendUnavailable(true);
      }

      saveUser(null);
    },
    [saveUser]
  );

  // Any 401 (or a redirect to a login page) from the API means the session is gone.
  useEffect(() => {
    const onUnauthorized = () => endSession("expired");

    window.addEventListener("payproof:unauthorized", onUnauthorized);

    return () => {
      window.removeEventListener("payproof:unauthorized", onUnauthorized);
    };
  }, [endSession]);

  // A request failed to connect: check whether the backend is reachable at all.
  useEffect(() => {
    const onNetworkError = async () => {
      if (!userRef.current) return;

      const now = Date.now();
      if (now - lastNetworkCheck.current < NETWORK_RECHECK_MS) return;
      lastNetworkCheck.current = now;

      const result = await authService.verifySession();

      if (result === "unavailable") endSession("unavailable");
    };

    window.addEventListener("payproof:network-error", onNetworkError);

    return () => {
      window.removeEventListener("payproof:network-error", onNetworkError);
    };
  }, [endSession]);

  // First check when the app loads.
  useEffect(() => {
    let cancelled = false;

    async function initializeSession() {
      const result = await authService.verifySession();

      if (cancelled) return;

      if (result === "unauthenticated") {
        endSession("expired");
      } else if (result === "unavailable") {
        endSession("unavailable");
      } else if (result === "ok" && !readStoredUser()) {
        // A valid session with nothing saved in this browser (for example after Google sign-in).
        const role = await authService.detectRole();

        if (cancelled) return;

        if (role) saveUser({ email: null, role });
      }
      // "error": a server problem that isn't a session or connection issue. Keep the saved session.

      if (!cancelled) setChecking(false);
    }

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, [endSession, saveUser]);

  // While signed in, keep checking: on a timer and whenever the user comes back to the tab.
  const loggedIn = !!user;

  useEffect(() => {
    if (!loggedIn) return undefined;

    let active = true;

    const check = async () => {
      const now = Date.now();

      if (now - lastCheck.current < FOCUS_THROTTLE_MS) {
        return;
      }

      lastCheck.current = now;

      const result = await authService.verifySession();

      if (!active) return;

      if (result === "unauthenticated") endSession("expired");
      else if (result === "unavailable") endSession("unavailable");
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };

    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      lastCheck.current = 0;
      check();
    }, RECHECK_MS);

    return () => {
      active = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [loggedIn, endSession]);

  const login = async (email, password) => {
    const response = await authService.login(email, password);

    const role = await authService.detectRole();

    if (!role) {
      saveUser(null);
      throw new Error("Unable to verify your account role. Please sign in again.");
    }

    const next = {
      email: response?.email || email,
      role,
    };

    setSessionExpired(false);
    setBackendUnavailable(false);
    saveUser(next);

    return next;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Clear local authentication even if the server request fails.
    }

    setSessionExpired(false);
    setBackendUnavailable(false);
    saveUser(null);
    window.location.replace("/login");
  };

  const value = {
    user,
    isAuthenticated: !!user && !checking,
    checking,
    sessionExpired,
    backendUnavailable,
    login,
    logout,
    saveUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);