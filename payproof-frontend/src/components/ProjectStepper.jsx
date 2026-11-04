import { Check } from "lucide-react";
import { Link } from "react-router-dom";

const STEPS = ["Review", "Agreement", "Funding", "Work", "Release"];

// current: index of the active step (0 to 4)
export default function ProjectStepper({ current = 0, jobId }) {
  const stepPaths = [
    `/projects/${jobId}`,
    `/agreements/${jobId}`,
    `/escrow/${jobId}`,
    `/projects/${jobId}/submission`,
    `/projects/${jobId}/receipt`,
  ];

  return (
    <div className="stepper" aria-label="Project progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Link
            key={label}
            to={stepPaths[i]}
            className={`step${done ? " done" : ""}${active ? " current" : ""}`}
            aria-current={active ? "step" : undefined}
            title={`Go to ${label}`}
          >
            {done && <Check size={14} />}
            {label}
            {active && <span className="dot" />}
          </Link>
        );
      })}
    </div>
  );
}