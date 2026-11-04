import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="logo">
      <span className="logo-mark">
        <ShieldCheck size={20} />
      </span>
      <span>PayProof</span>
    </Link>
  );
}