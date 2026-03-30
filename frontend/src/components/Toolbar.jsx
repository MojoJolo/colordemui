export default function Toolbar({
  images,
  selectedCount,
  onSelectAll,
  onUnselectAll,
  onDeleteSelected,
  onDownloadPdf,
}) {
  if (!images || images.length === 0) return null;

  const doneImages = images.filter((img) => img.status === "done");

  return (
    <div className="toolbar">
      <span className="toolbar-info">
        {selectedCount} of {doneImages.length} selected
      </span>
      <div className="toolbar-actions">
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All
        </button>
        <button className="btn btn-secondary" onClick={onUnselectAll}>
          Unselect All
        </button>
        <button
          className="btn btn-danger"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
        >
          Delete Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button
          className="btn btn-primary"
          onClick={onDownloadPdf}
          disabled={selectedCount === 0}
        >
          Download PDF{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>
    </div>
  );
}
