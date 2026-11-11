import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || 'A';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <div>
            <strong>PayProof</strong>
            <small>Resolver console</small>
          </div>
        </div>
        <nav>
          <NavLink to="/disputes">Disputes</NavLink>
          <NavLink to="/bans">Bans</NavLink>
          <NavLink to="/chain">Chain info</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <span className="avatar">{initials}</span>
            <div>
              <div className="me-name">{user?.firstName} {user?.lastName}</div>
              <small>{user?.accountType}</small>
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}