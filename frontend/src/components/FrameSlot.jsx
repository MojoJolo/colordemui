import { useRef } from "react";

const MAX_PIXELS = 1_000_000;

export function scaleViaCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const total = img.width * img.height;
      let w = img.width;
      let h = img.height;
      if (total > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / total);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Reusable image slot: gallery picker + upload zone, mutually exclusive. */
export default function FrameSlot({
  label,
  optional,
  candidates,
  selectedId,
  onSelectId,
  uploadedDataUrl,
  onUpload,
  onClearUpload,
  disabled,
}) {
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    try {
      const dataUrl = await scaleViaCanvas(file);
      onUpload(dataUrl);
    } catch (e) {
      console.error("Failed to load image:", e);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const hasUpload = !!uploadedDataUrl;
  const hasGallery = !!selectedId;

  return (
    <div className="pvideo-frame-slot">
      <label className="prompt-label">
        {label}
        {optional && <span className="pvideo-optional"> (optional)</span>}
      </label>

      {/* Gallery picker — dimmed when upload is active */}
      {candidates.length > 0 && (
        <div className={`pvideo-picker${hasUpload ? " pvideo-picker-dim" : ""}`}>
          {candidates.map((img) => (
            <div
              key={img.image_id}
              className={`pvideo-thumb${!hasUpload && selectedId === img.image_id ? " selected" : ""}`}
              onClick={() => {
                if (disabled || hasUpload) return;
                onSelectId(selectedId === img.image_id ? null : img.image_id);
              }}
              title={img.prompt}
            >
              <img src={img.url} alt={img.prompt} loading="lazy" />
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="pvideo-or-divider"><span>or upload</span></div>
      )}

      {/* Upload zone */}
      {hasUpload ? (
        <div className="pvideo-upload-preview">
          <img src={uploadedDataUrl} alt="uploaded" />
          {!disabled && (
            <button type="button" className="pvideo-upload-clear" onClick={onClearUpload}>
              ✕
            </button>
          )}
        </div>
      ) : (
        <div
          className="pvideo-upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            disabled={disabled}
          />
          <span className="pvideo-upload-icon">↑</span>
          <span className="pvideo-upload-hint">
            {hasGallery ? "Or drop a file to override gallery selection" : "Drop or click to upload"}
          </span>
        </div>
      )}
    </div>
  );
}
