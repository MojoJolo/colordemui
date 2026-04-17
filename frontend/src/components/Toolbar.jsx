export default function Toolbar({
  images,
  selectedCount,
  onSelectAll,
  onUnselectAll,
  onDeleteSelected,
  onDownloadPdf,
  triggerWord,
  onTriggerWordChange,
  onDownloadLoraZip,
}) {
  if (!images || images.length === 0) return null;

  const doneImages = images.filter((img) => img.status === "done");

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <span className="toolbar-info">
          {selectedCount} of {doneImages.length} selected
        </span>
        <div className="toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={onSelectAll}>
            Select All
          </button>
          <button type="button" className="btn btn-secondary" onClick={onUnselectAll}>
            Unselect All
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
          >
            Delete Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onDownloadPdf}
            disabled={selectedCount === 0}
          >
            Download PDF{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </div>
      </div>

      <div className="toolbar-lora-row">
        <input
          type="text"
          className="toolbar-trigger-input"
          placeholder="Trigger word (optional)"
          value={triggerWord}
          onChange={(e) => onTriggerWordChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDownloadLoraZip}
          disabled={selectedCount === 0}
        >
          Download LoRA{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>
    </div>
  );
}
