import { request, BACKEND_ORIGIN } from "./api.js";

export const login = (email, password) =>
  request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

export const verifyLoginOtp = (email, code) =>
  request("/api/auth/verify-otp", {
    method: "POST",
    body: { email, code },
  });

export const resendLoginOtp = (email) =>
  request("/api/auth/resend-otp", {
    method: "POST",
    body: { email },
  });

export const register = (payload) =>
  request("/api/auth/register", {
    method: "POST",
    body: payload,
  });

export const logout = () =>
  request("/api/auth/logout", { method: "POST" });

export const getCurrentUser = () => request("/api/auth/me");

export async function startGoogleLogin(role) {
  const { authorizationUrl } = await request(
    `/api/auth/google?role=${encodeURIComponent(role)}`
  );

  window.location.href = `${BACKEND_ORIGIN}${authorizationUrl}`;
}

export async function detectRole() {
  try {
    await request("/api/jobs/client");
    return "CLIENT";
  } catch (error) {
    if (error.status === 401) return null;
  }

  try {
    await request("/api/jobs/freelancer");
    return "FREELANCER";
  } catch {
    return null;
  }
}

const SESSION_CHECK_TIMEOUT_MS = 8000;

/**
 * Asks the backend whether the session is still valid.
 * Resolves to:
 *   "ok"              the session is valid
 *   "unauthenticated" the session is gone (401, 403, or a redirect to a login page)
 *   "unavailable"     the backend can't be reached (network failure, timeout, gateway error)
 *   "error"           some other server problem; the session state is unknown
 *
 * This calls fetch directly instead of request() so a redirect can be read as "signed out"
 * and a connection failure as "unavailable".
 */
export async function verifySession() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_ORIGIN}/api/auth/wallet`, {
      method: "GET",
      credentials: "include",
      redirect: "manual",
      signal: controller.signal,
    });

    if (res.type === "opaqueredirect") return "unauthenticated";
    if (res.status === 401 || res.status === 403) return "unauthenticated";
    if (res.ok) return "ok"; // 200, or 204 when no wallet is linked

    if (res.status === 502 || res.status === 503 || res.status === 504) return "unavailable";

    if (res.status === 500) {
      const text = await res.text().catch(() => "");
      // An empty 500 is what the dev proxy sends when it can't reach the backend.
      return text.trim() ? "error" : "unavailable";
    }

    return "error";
  } catch {
    return "unavailable";
  } finally {
    window.clearTimeout(timer);
  }
}