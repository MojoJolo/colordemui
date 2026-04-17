import { useState } from "react";

export default function ImageCard({ image, onSelect, onDelete, onExpand }) {
  const { status, url, prompt, selected, error } = image;
  const [copied, setCopied] = useState(false);

  const isDone = status === "done";
  const isFailed = status === "failed";
  const isRunning = status === "running";
  const isPending = status === "pending";

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
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
