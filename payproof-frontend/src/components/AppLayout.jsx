import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutGrid,
  Folder,
  FileCheck,
  Wallet,
  Clock,
  Bell,
  ChevronDown,
  ArrowUpRight,
  X,
} from "lucide-react";
import Logo from "./Logo.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";

const NAV_ITEMS = [
  { to: "/overview", label: "Overview", icon: LayoutGrid },
  { to: "/projects", label: "Projects", icon: Folder },
  { to: "/agreements", label: "Agreements", icon: FileCheck },
  { to: "/escrow", label: "Escrow", icon: Wallet },
  { to: "/activity", label: "Activity", icon: Clock },
];

function displayName(user) {
  const full = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ");

  return full || user?.email || "Account";
}

function workspaceLabel(role) {
  if (role === "CLIENT") return "Client workspace";
  if (role === "FREELANCER") return "Freelancer workspace";
  return "Workspace";
}

export default function AppLayout() {
  const { user, logout } = useAuth();

  const {
    address,
    isConnected,
    loading,
    busy,
    error,
    loadError,
    clearError,
    connect,
    disconnect,
  } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
  };

  const handleDisconnectWallet = async () => {
    setMenuOpen(false);
    await disconnect();
  };

  return (
    <>
      <header className="topbar">
        <Logo to="/overview" />

        <div className="topbar-right">
          {isConnected ? (
            <span className="wallet-status">
              <span className="dot" />
              {address} · Connected
            </span>
          ) : (
            <button
              type="button"
              className="wallet-connect-btn"
              onClick={connect}
              disabled={loading || !!busy}
            >
              <Wallet size={16} />
              {busy === "connect" ? "Connecting..." : "Connect wallet"}
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </button>

          <div className="user-menu">
            <button
              type="button"
              className="user-menu-btn"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {displayName(user)}
              <ChevronDown size={14} />
            </button>

            {menuOpen && (
              <div className="user-menu-pop">
                {isConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectWallet}
                    disabled={!!busy}
                  >
                    {busy === "disconnect"
                      ? "Disconnecting..."
                      : "Disconnect wallet"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="workspace-card">
          <div className="workspace-label">
            {workspaceLabel(user?.role)}
          </div>

          <div className="workspace-name">
            {displayName(user)}
          </div>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a href="#help">
            Help center <ArrowUpRight size={12} />
          </a>

          <span className="network">
            <span className="dot" /> NEAR Testnet
          </span>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) =>
              `mobile-nav-link${isActive ? " active" : ""}`
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="main">
        {error && (
          <div className="wallet-banner" role="alert">
            <span>{error}</span>

            <button
              type="button"
              className="icon-btn"
              aria-label="Dismiss"
              onClick={clearError}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {loadError && !isConnected && (
          <div className="wallet-banner" role="alert">
            <span>
              Couldn't check your linked wallet: {loadError}
            </span>
          </div>
        )}

        <Outlet />
      </main>
    </>
  );
}