const BASE = 'https://payproof-admin-backend.onrender.com';
const TOKEN_KEY = 'auth_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || [];
  }
}

async function request(path, { method = 'GET', body, silent = false } = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the backend is running.');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && !silent) {
    tokenStore.clear();
    onUnauthorized();
  }
  if (!res.ok) {
    const msg =
      (data && data.error) || (typeof data === 'string' && data) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data && data.details);
  }
  return data;
}

const e = encodeURIComponent;

export const authApi = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password }, silent: true }),
  logout: () => request('/api/auth/logout', { method: 'POST', silent: true }),
  me: () => request('/api/auth/me', { silent: true }),
};

export const disputesApi = {
  list: () => request('/api/disputes'),
  dossier: (id) => request(`/api/disputes/${e(id)}/dossier`),
  propose: (id, freelancerAmountYocto, reason) =>
    request(`/api/disputes/${e(id)}/propose`, { method: 'POST', body: { freelancerAmountYocto, reason } }),
  cancel: (id, reason) => request(`/api/disputes/${e(id)}/cancel`, { method: 'POST', body: { reason } }),
  retry: (id) => request(`/api/disputes/${e(id)}/retry`, { method: 'POST' }),
};

export const bansApi = {
  list: () => request('/api/bans'),
  ban: (accountId, reason) => request('/api/bans', { method: 'POST', body: { accountId, reason } }),
  unban: (userId, reason) => request(`/api/bans/${e(userId)}`, { method: 'DELETE', body: { reason } }),
  history: (userId) => request(`/api/bans/${e(userId)}/history`),
};

export const chainApi = {
  config: () => request('/api/chain/config'),
  fees: () => request('/api/chain/fees'),
};