import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Disputes from './pages/Disputes';
import DisputeDetail from './pages/DisputeDetail';
import Bans from './pages/Bans';
import ChainInfo from './pages/ChainInfo';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/disputes" replace />} />
        <Route path="/disputes" element={<Disputes />} />
        <Route path="/disputes/:escrowId" element={<DisputeDetail />} />
        <Route path="/bans" element={<Bans />} />
        <Route path="/chain" element={<ChainInfo />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}