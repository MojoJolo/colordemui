export default function ImageCard({ image, onSelect, onDelete }) {
  const { status, url, prompt, selected, error } = image;

  const isDone = status === "done";
  const isFailed = status === "failed";
  const isRunning = status === "running";
  const isPending = status === "pending";

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
          <img src={url} alt={prompt} loading="lazy" />
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
        <button
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
  );
}
