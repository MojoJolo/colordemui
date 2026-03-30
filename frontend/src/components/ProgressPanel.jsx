export default function ProgressPanel({ job }) {
  if (!job) return null;

  const percent =
    job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  const isDone = job.status === "done";

  return (
    <div className="progress-panel">
      <div className="progress-header">
        <span className="progress-text">
          {isDone
            ? `Done — ${job.total} image${job.total !== 1 ? "s" : ""} processed`
            : `Generating ${job.completed + 1} of ${job.total}…`}
        </span>
        <span className="progress-percent">{percent}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
