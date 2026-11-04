export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || "";

// Only these POSTs skip the CSRF token (there is no session yet when they run).
// Every other request that changes data, including the wallet endpoints and logout, sends it.
const CSRF_EXEMPT_PATHS = ["/api/auth/login", "/api/auth/register"];

// Development-only logging of request metadata. Never logs bodies, headers or tokens.
const devLog = (...args) => {
  if (import.meta.env.DEV) console.info(...args);
};

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));

  return cookie
    ? decodeURIComponent(cookie.substring(prefix.length))
    : null;
}

let csrfPromise = null;

async function ensureCsrfToken() {
  if (getCookie("XSRF-TOKEN")) return;

  if (!csrfPromise) {
    csrfPromise = fetch(`${BACKEND_ORIGIN}/api/csrf`, {
      method: "GET",
      credentials: "include",
    }).finally(() => {
      csrfPromise = null;
    });
  }

  const response = await csrfPromise;

  if (!response.ok || !getCookie("XSRF-TOKEN")) {
    throw new ApiError("Unable to obtain CSRF token", response.status, null);
  }
}

export async function request(
  path,
  { method = "GET", body, isForm = false } = {}
) {
  const upperMethod = method.toUpperCase();
  const csrfExempt = CSRF_EXEMPT_PATHS.some((p) => path === p || path.startsWith(`${p}?`));

  const headers = {};

  // For multipart bodies (isForm) the browser sets Content-Type and the boundary itself.
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod) && !csrfExempt) {
    await ensureCsrfToken();

    const csrfToken = getCookie("XSRF-TOKEN");

    if (!csrfToken) {
      throw new ApiError("CSRF token is missing", 403, null);
    }

    headers["X-XSRF-TOKEN"] = csrfToken;
  }

  devLog("[PayProof API] Request", {
    method: upperMethod,
    path,
    hasBody: !!body,
    sendsCsrf: !!headers["X-XSRF-TOKEN"],
  });

  let res;
  try {
    res = await fetch(`${BACKEND_ORIGIN}${path}`, {
      method: upperMethod,
      headers,
      credentials: "include",
      // Never follow redirects: the backend redirects signed-out API calls to Google or a
      // login page, which the browser would otherwise report as a network error.
      redirect: "manual",
      body: body
        ? isForm
          ? body
          : JSON.stringify(body)
        : undefined,
    });
  } catch (err) {
    devLog("[PayProof API] Network error", {
      method: upperMethod,
      path,
      message: err?.message,
    });

    // Lets the session layer check whether the backend is reachable at all.
    window.dispatchEvent(new Event("payproof:network-error"));
    throw err;
  }

  devLog("[PayProof API] Response", {
    method: upperMethod,
    path,
    status: res.status,
    type: res.type,
  });

  // A redirect means the session is gone (redirect to a login page or Google).
  if (res.type === "opaqueredirect") {
    window.dispatchEvent(new Event("payproof:unauthorized"));
    throw new ApiError("Your session has expired. Please sign in again.", 401, null);
  }

  const text = await res.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event("payproof:unauthorized"));
    }

    // Gateway errors, or an empty 500 from the dev proxy, mean the backend isn't reachable.
    if (
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      (res.status === 500 && !text)
    ) {
      window.dispatchEvent(new Event("payproof:network-error"));
    }

    const message =
      (data &&
        typeof data === "object" &&
        (data.message || data.error)) ||
      `Request failed (${res.status})`;

    throw new ApiError(message, res.status, data);
  }

  return data;
}