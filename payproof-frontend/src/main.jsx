import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { WalletProvider } from "./context/WalletContext.jsx";
import "./css/index.css";
import "./css/layout.css";
import "./css/ui.css";
import "./css/auth.css";
import "./css/project.css";
import "./css/agreement.css";
import "./css/wallet.css";
import "./css/terms.css";
import "./css/escrow.css";
import "./css/preview.css";
import "./css/checks.css";
import "./css/responsive.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);