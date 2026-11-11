import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./components/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Projects from "./pages/Projects.jsx";
import CreateProject from "./pages/CreateProject.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import Dispute from "./pages/Dispute.jsx";
import Disputes from "./pages/Disputes.jsx";
import SubmitWork from "./pages/SubmitWork.jsx";
import SubmissionVersion from "./pages/SubmissionVersion.jsx";
import Agreements from "./pages/Agreements.jsx";
import AgreementReview from "./pages/AgreementReview.jsx";
import Escrow from "./pages/Escrow.jsx";
import EscrowFunding from "./pages/EscrowFunding.jsx";
import Overview from "./pages/Overview.jsx";
import Activity from "./pages/Activity.jsx";
import PaymentReceipt from "./pages/PaymentReceipt.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/overview" element={<Overview />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<CreateProject />} />
        <Route path="/projects/:jobId" element={<ProjectDetail />} />
        <Route path="/projects/:jobId/dispute" element={<Dispute />} />
        <Route path="/projects/:jobId/submission" element={<SubmitWork />} />
        <Route path="/projects/:jobId/receipt" element={<PaymentReceipt />} />
        <Route
          path="/projects/:jobId/submissions/:versionId"
          element={<SubmissionVersion />}
        />
        <Route path="/agreements" element={<Agreements />} />
        <Route path="/agreements/:jobId" element={<AgreementReview />} />
        <Route path="/escrow" element={<Escrow />} />
        <Route path="/escrow/:jobId" element={<EscrowFunding />} />
        <Route path="/disputes" element={<Disputes />} />
        <Route path="/activity" element={<Activity />} />
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}