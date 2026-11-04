import { useEffect, useState } from "react";
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";

export default function PdfPreview({ url, name, refreshKey = 0 }) {
  const [state, setState] = useState({ status: "loading", src: null, mode: "blob" });
  const [tall, setTall] = useState(false);

  useEffect(() => {
    if (!url) return undefined;

    let cancelled = false;
    let objectUrl = null;
    setState({ status: "loading", src: null, mode: "blob" });

    (async () => {
      try {
        // Same-origin files (through the Vite proxy) send the session cookie.
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        if (cancelled) return;

        // An HTML answer here is a login page or an error page, not a PDF.
        if (/html/i.test(blob.type)) {
          setState({ status: "error", src: null, mode: "blob" });
          return;
        }

        // Re-type as PDF so it shows inline even when the server sends it as a download.
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setState({ status: "ready", src: objectUrl, mode: "blob" });
      } catch {
        if (cancelled) return;
        // The file couldn't be read from the page (often cross-origin). Try the link directly.
        setState({ status: "ready", src: url, mode: "direct" });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, refreshKey]);

  if (!url) return null;

  return (
    <div className="pdf-preview">
      <div className="pdf-toolbar">
        <span className="pdf-name">{name || "Agreement.pdf"}</span>
        <div className="pdf-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={tall ? "Make the preview smaller" : "Make the preview larger"}
            onClick={() => setTall((t) => !t)}
          >
            {tall ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <a
            className="icon-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the agreement in a new tab"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </div>

      {state.status === "loading" && <div className="pdf-state">Loading preview...</div>}

      {state.status === "error" && (
        <div className="pdf-state">
          The preview couldn't be loaded.{" "}
          <a className="row-link" href={url} target="_blank" rel="noopener noreferrer">
            Open the file
          </a>
        </div>
      )}

      {state.status === "ready" && (
        <iframe
          className={`pdf-frame${tall ? " tall" : ""}`}
          src={state.mode === "blob" ? `${state.src}#view=FitH` : state.src}
          title={name || "Agreement preview"}
        />
      )}

      {state.status === "ready" && (
        <p className="pdf-foot">
          Preview not showing?{" "}
          <a className="row-link" href={url} target="_blank" rel="noopener noreferrer">
            Open it in a new tab
          </a>
        </p>
      )}
    </div>
  );
}