import { useState } from "react";

export default function ImageCard({ image, onSelect, onDelete, onExpand }) {
  const { status, url, prompt, selected, error } = image;
  const [copied, setCopied] = useState(false);

  const isDone = status === "done";
  const isFailed = status === "failed";
  const isRunning = status === "running";
  const isPending = status === "pending";

  function handleCopyPrompt() {
    const text = prompt ?? "";
    const markCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };

    // Try legacy execCommand first so the user-gesture context is preserved.
    // If that fails (e.g., blocked by browser), fall back to the async
    // Clipboard API, which also works in secure contexts where execCommand is
    // disabled.
    if (legacyCopy(text)) {
      markCopied();
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(markCopied).catch(() => {
        // Last resort: try legacy once more in case focus was the issue.
        if (legacyCopy(text)) markCopied();
      });
    }
  }

  function legacyCopy(text) {
    if (typeof document === "undefined" || !document.queryCommandSupported) {
      return false;
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    // Keep on-screen but invisible so mobile browsers (iOS, Android) will
    // still allow selection. Off-screen elements are silently rejected by
    // some engines.
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "1px";
    el.style.height = "1px";
    el.style.padding = "0";
    el.style.border = "0";
    el.style.outline = "0";
    el.style.boxShadow = "none";
    el.style.background = "transparent";
    el.style.opacity = "0";
    // Avoid iOS zoom on focus.
    el.style.fontSize = "16px";
    document.body.appendChild(el);

    const prevActive = document.activeElement;
    let ok = false;
    try {
      if (/ipad|iphone|ipod/i.test(navigator.userAgent)) {
        // iOS Safari needs a range + selection, not el.select().
        el.contentEditable = "true";
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        el.setSelectionRange(0, text.length);
      } else {
        el.focus();
        el.select();
      }
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(el);
    if (prevActive && typeof prevActive.focus === "function") {
      try {
        prevActive.focus();
      } catch (_) {
        /* ignore */
      }
    }
    return ok;
  }

  return (
    <div
      className={[
        "image-card",
        isDone && selected ? "selected" : "",
        isFailed ? "failed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Image preview area */}
      <div className="image-preview">
        {isDone && url ? (
          image.filename?.endsWith(".mp4") ? (
            <video
              src={url}
              autoPlay
              loop
              muted
              playsInline
              className="expandable"
              onClick={() => onExpand && onExpand(image)}
            />
          ) : (
            <img
              src={url}
              alt={prompt}
              loading="lazy"
              className="expandable"
              onClick={() => onExpand && onExpand(image)}
            />
          )
        ) : isRunning ? (
          <div className="image-placeholder loading">
            <div className="spinner" />
            <span>Generating…</span>
          </div>
        ) : isPending ? (
          <div className="image-placeholder pending">
            <span>Pending</span>
          </div>
        ) : isFailed ? (
          <div className="image-placeholder error">
            <span>Failed</span>
          </div>
        ) : null}
      </div>

      {/* Prompt + error text */}
      <div className="image-info">
        <p className="image-prompt" title={prompt}>
          {prompt}
        </p>
        {isFailed && error && (
          <p className="image-error" title={error}>
            {error}
          </p>
        )}
      </div>

      {/* Actions row */}
      <div className="image-actions">
        {isDone && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
            />
            <span>{selected ? "Selected" : "Not selected"}</span>
          </label>
        )}
        <div className="image-actions-right">
          <button
            type="button"
            className="btn btn-icon btn-copy"
            onClick={handleCopyPrompt}
            title="Copy prompt"
            aria-label="Copy prompt"
          >
            {copied ? "✓" : "⎘"}
          </button>
          {isDone && image.filename?.endsWith(".mp4") && (
            <a
              href={url}
              download={image.filename}
              className="btn btn-icon btn-copy"
              title="Download video"
              aria-label="Download video"
            >
              ↓
            </a>
          )}
          <button
            type="button"
            className="btn btn-icon btn-delete"
            onClick={onDelete}
            disabled={isRunning}
            title="Delete image"
            aria-label="Delete image"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
