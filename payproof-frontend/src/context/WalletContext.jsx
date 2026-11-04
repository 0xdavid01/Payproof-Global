import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getLinkedWallet, revokeWallet } from "../services/walletService.js";

const WalletContext = createContext(null);

// The NEAR wallet libraries load only when needed, so a problem inside them
// can never blank the whole app.
const loadNear = () =>
  Promise.all([
    import("@near-wallet-selector/modal-ui/styles.css"),
    import("../services/nearWallet.js"),
  ]).then(([, mod]) => mod);

function friendlyError(err) {
  let text;
  switch (err?.status) {
    case 409:
      text = "This wallet is already linked to another PayProof account.";
      break;
    case 403:
      text = "That challenge belongs to a different account. Please try again.";
      break;
    case 401:
      text =
        "The wallet signature could not be verified. Make sure the wallet is on the same network and the key belongs to the account.";
      break;
    case 400:
      text = "The wallet challenge expired or was rejected. Please try connecting again.";
      break;
    default:
      return err?.message || "Could not connect your wallet. Please try again.";
  }

  // Keep the backend's own message too, so the real reason isn't hidden.
  const raw = err?.message;
  return raw && raw !== text && !/^Request failed/.test(raw) ? `${text} (${raw})` : text;
}

// Reads the backend's wallet record, whatever shape it comes in.
// Returns null when there is no active linked wallet.
function normalizeLinkedWallet(data) {
  if (!data || typeof data !== "object") return null;

  const inner =
    data.wallet && typeof data.wallet === "object"
      ? data.wallet
      : data.data && typeof data.data === "object" && !Array.isArray(data.data)
        ? data.data
        : data;

  const address = inner.walletAddress ?? inner.accountId ?? inner.address ?? null;
  if (!address) return null;

  const status = String(inner.status ?? "").toUpperCase();
  if (/REVOK|DISCONNECT|INACTIVE|DISABLED/.test(status) || inner.revokedAt) return null;

  return { ...inner, walletAddress: address, status };
}

export function WalletProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(""); // "connect" | "disconnect" | ""
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(""); // the linked-wallet lookup itself failed
  const [lastLookup, setLastLookup] = useState(null); // raw outcome of the last lookup
  const [lastConnect, setLastConnect] = useState(null); // what happened in the last connect attempt

  // Looks up the wallet linked to this PayProof account. Resolves to the wallet or null.
  const refresh = useCallback(async () => {
    try {
      const data = await getLinkedWallet(); // null means HTTP 204: no wallet linked
      const linked = normalizeLinkedWallet(data);

      setLastLookup({
        outcome: data == null ? "empty (204, no wallet for this session)" : linked ? "linked" : "rejected",
        body: data ?? null,
      });
      setLoadError("");
      setWallet(linked);
      return linked;
    } catch (err) {
      // An error is not the same as "no wallet": keep what we had and show the reason.
      console.error("[PayProof] Could not read the linked wallet:", err);
      setLastLookup({
        outcome: "error",
        httpStatus: err?.status ?? null,
        message: err?.message ?? null,
        body: err?.data ?? null,
      });
      setLoadError(
        `${err?.message || "Request failed"}${err?.status ? ` (HTTP ${err.status})` : ""}`
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the linked wallet whenever someone signs in; clear it when they sign out.
  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      refresh();
    } else {
      setWallet(null);
      setError("");
      setLoadError("");
      setLastLookup(null);
      setLastConnect(null);
      setLoading(false);
    }
  }, [isAuthenticated, refresh]);

  const connect = useCallback(async () => {
    setError("");
    setBusy("connect");

    // Tracks how far the attempt got, so a failure can be traced to a stage.
    let step = "start";
    let detail = {};
    const onStep = (name, info = {}) => {
      step = name;
      detail = { ...detail, ...info };
    };

    try {
      const { connectAndLinkWallet } = await loadNear();
      const result = await connectAndLinkWallet(onStep);
      console.debug("[PayProof] Wallet verification response:", result);

      setLastConnect({
        outcome: "backend accepted the wallet",
        reachedStep: step,
        verifyResponse: result
          ? {
              userId: result.userId,
              walletAddress: result.walletAddress,
              network: result.network,
              role: result.role,
              message: result.message,
            }
          : null,
        ...detail,
      });

      const linked = await refresh();
      if (!linked) {
        setError(
          "PayProof accepted the wallet, but the linked wallet could not be read back. Check GET /api/auth/wallet."
        );
      }
    } catch (err) {
      console.error("[PayProof] Wallet connect failed at step:", step, err);
      setLastConnect({
        outcome: "failed",
        failedAt: step,
        httpStatus: err?.status ?? null,
        message: err?.message ?? String(err),
        backendBody: err?.data ?? null,
        ...detail,
      });
      setError(friendlyError(err));
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    setError("");
    setBusy("disconnect");
    try {
      await revokeWallet();
      setWallet(null);
      try {
        const { disconnectNearWallet } = await loadNear();
        await disconnectNearWallet();
      } catch {
        /* the backend link is already revoked; the browser session can stay */
      }
    } catch (err) {
      setError(err?.message || "Could not disconnect your wallet.");
    } finally {
      setBusy("");
    }
  }, []);

  // Shown in the dev-only diagnostics box: the last lookup plus the last connect attempt.
  const lastCheck = lastLookup || lastConnect ? { ...(lastLookup || {}), lastConnect } : null;

  const value = {
    wallet,
    address: wallet?.walletAddress ?? null,
    isConnected: !!wallet,
    loading,
    busy,
    error,
    loadError,
    lastCheck,
    clearError: () => setError(""),
    connect,
    disconnect,
    refresh,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);