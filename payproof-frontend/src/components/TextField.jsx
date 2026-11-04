import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function TextField({ label, type = "text", hint, ...rest }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-control">
        <input id={id} type={isPassword && show ? "text" : type} {...rest} />
        {isPassword && (
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        )}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}