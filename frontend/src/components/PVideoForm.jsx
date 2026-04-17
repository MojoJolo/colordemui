import { useRef, useState } from "react";

const MAX_PIXELS = 1_000_000;

function scaleViaCanvas(file) {
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

// Reusable frame slot: gallery picker + upload zone, mutually exclusive
function FrameSlot({ label, optional, candidates, selectedId, onSelectId, uploadedDataUrl, onUpload, onClearUpload, disabled }) {
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
              <img src={img.url} alt={img.prompt} />
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

export default function PVideoForm({ onGenerate, isGenerating, images }) {
  const [prompt, setPrompt] = useState("");

  const [selectedImageId, setSelectedImageId] = useState(null);
  const [firstFrameDataUrl, setFirstFrameDataUrl] = useState(null);

  const [selectedLastFrameId, setSelectedLastFrameId] = useState(null);
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState(null);

  const [duration, setDuration] = useState(5);
  const [saveAudio, setSaveAudio] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("9:16");

  const ASPECT_RATIOS = [
    { value: "9:16",  label: "9:16",  desc: "Reels" },
    { value: "1:1",   label: "1:1",   desc: "Square" },
    { value: "4:3",   label: "4:3",   desc: "Classic" },
    { value: "16:9",  label: "16:9",  desc: "Wide" },
    { value: "3:4",   label: "3:4",   desc: "Portrait" },
    { value: "2:3",   label: "2:3",   desc: "Story" },
    { value: "3:2",   label: "3:2",   desc: "Photo" },
  ];

  const candidates = images.filter(
    (img) =>
      img.status === "done" &&
      img.url &&
      !img.filename?.endsWith(".mp4") &&
      !img.filename?.endsWith(".svg")
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate([prompt.trim()], "p-video", null, {
      selectedImageId: firstFrameDataUrl ? undefined : (selectedImageId || undefined),
      firstFrameData: firstFrameDataUrl || undefined,
      selectedLastFrameImageId: lastFrameDataUrl ? undefined : (selectedLastFrameId || undefined),
      lastFrameData: lastFrameDataUrl || undefined,
      duration,
      aspectRatio,
      saveAudio,
    });
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">p-video</span>
        <span className="klein-model-desc">Image-to-video generation</span>
      </div>

      {/* Source frame */}
      <FrameSlot
        label="Source Image"
        optional
        candidates={candidates}
        selectedId={selectedImageId}
        onSelectId={setSelectedImageId}
        uploadedDataUrl={firstFrameDataUrl}
        onUpload={(dataUrl) => { setFirstFrameDataUrl(dataUrl); setSelectedImageId(null); }}
        onClearUpload={() => setFirstFrameDataUrl(null)}
        disabled={isGenerating}
      />

      {/* Last frame */}
      <FrameSlot
        label="Last Frame"
        optional
        candidates={candidates}
        selectedId={selectedLastFrameId}
        onSelectId={setSelectedLastFrameId}
        uploadedDataUrl={lastFrameDataUrl}
        onUpload={(dataUrl) => { setLastFrameDataUrl(dataUrl); setSelectedLastFrameId(null); }}
        onClearUpload={() => setLastFrameDataUrl(null)}
        disabled={isGenerating}
      />

      {/* Duration */}
      <div className="pvideo-duration-row">
        <span className="prompt-label">Duration</span>
        <span className="pvideo-duration-value">{duration}s</span>
      </div>
      <input
        id="pvideo-duration"
        type="range"
        className="pvideo-duration-slider"
        value={duration}
        min={1}
        max={10}
        step={1}
        onChange={(e) => setDuration(Number(e.target.value))}
        disabled={isGenerating}
      />

      {/* Aspect ratio */}
      <label className="prompt-label">Aspect Ratio</label>
      <div className="pvideo-aspect-grid">
        {ASPECT_RATIOS.map(({ value, label, desc }) => (
          <button
            key={value}
            type="button"
            className={`pvideo-aspect-btn${aspectRatio === value ? " selected" : ""}`}
            onClick={() => setAspectRatio(value)}
            disabled={isGenerating}
          >
            <span className="pvideo-aspect-ratio">{label}</span>
            <span className="pvideo-aspect-desc">{desc}</span>
          </button>
        ))}
      </div>

      {/* Prompt */}
      <label htmlFor="pvideo-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="pvideo-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the motion or scene…"
        rows={3}
        disabled={isGenerating}
      />

      {/* Audio toggle */}
      <label className="pvideo-toggle-label">
        <input
          type="checkbox"
          checked={saveAudio}
          onChange={(e) => setSaveAudio(e.target.checked)}
          disabled={isGenerating}
        />
        <span>Save audio</span>
      </label>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
      >
        {isGenerating ? "Generating…" : "Generate Video"}
      </button>
    </form>
  );
}
