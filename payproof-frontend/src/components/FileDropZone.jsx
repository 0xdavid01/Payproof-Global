import { useRef, useState } from "react";
import { CloudUpload, FileText, X } from "lucide-react";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropzone({
  file,
  onChange,
  disabled = false,
  maxMb = 20,
  title = "Drop your PRD here, or browse files",
  hint = "PDF · Up to 20 MB",
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  const accept = (picked) => {
    if (!picked) return;
    const isPdf = picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setLocalError("Only PDF files are supported.");
      return;
    }
    if (picked.size > maxMb * 1024 * 1024) {
      setLocalError(`File is larger than ${maxMb} MB.`);
      return;
    }
    setLocalError("");
    onChange(picked);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        className={`dropzone${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
      >
        <CloudUpload size={32} />
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {localError && <p className="field-error">{localError}</p>}

      {file && (
        <div className="file-row">
          <FileText size={22} />
          <div className="file-meta">
            <strong>{file.name}</strong>
            <span className="muted">{formatSize(file.size)} · Ready to upload</span>
          </div>
          {!disabled && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove file"
              onClick={() => onChange(null)}
            >
              <X size={20} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}