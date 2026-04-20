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

function extractVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadeddata = () => { video.currentTime = 0; };
    video.onseeked = () => {
      let w = video.videoWidth;
      let h = video.videoHeight;
      const total = w * h;
      if (total > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / total);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(video, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load video")); };
  });
}

function FrameSlot({ label, optional, candidates, selectedId, onSelectId, uploadedDataUrl, onUpload, onClearUpload, disabled }) {
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    try {
      const dataUrl = file.type.startsWith("video/")
        ? await extractVideoFrame(file)
        : await scaleViaCanvas(file);
      onUpload(dataUrl);
    } catch (e) {
      console.error("Failed to load file:", e);
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
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            disabled={disabled}
          />
          <span className="pvideo-upload-icon">↑</span>
          <span className="pvideo-upload-hint">
            {hasGallery ? "Or drop an image or video to override gallery selection" : "Drop or click to upload image or video"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function GrokVideoForm({ onGenerate, isGenerating, images }) {
  const [prompt, setPrompt] = useState("");
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [firstFrameDataUrl, setFirstFrameDataUrl] = useState(null);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");

  const ASPECT_RATIOS = [
    { value: "16:9",  label: "16:9",  desc: "Wide" },
    { value: "9:16",  label: "9:16",  desc: "Reels" },
    { value: "1:1",   label: "1:1",   desc: "Square" },
    { value: "4:3",   label: "4:3",   desc: "Classic" },
    { value: "3:4",   label: "3:4",   desc: "Portrait" },
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
    onGenerate([prompt.trim()], "grok-video", null, {
      selectedImageId: firstFrameDataUrl ? undefined : (selectedImageId || undefined),
      firstFrameData: firstFrameDataUrl || undefined,
      duration,
      aspectRatio,
    });
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">grok-video</span>
        <span className="klein-model-desc">Text-to-video generation</span>
      </div>

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

      <div className="pvideo-duration-row">
        <span className="prompt-label">Duration</span>
        <span className="pvideo-duration-value">{duration}s</span>
      </div>
      <input
        type="range"
        className="pvideo-duration-slider"
        value={duration}
        min={1}
        max={8}
        step={1}
        onChange={(e) => setDuration(Number(e.target.value))}
        disabled={isGenerating}
      />

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

      <label htmlFor="grok-video-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="grok-video-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the video scene or motion…"
        rows={3}
        disabled={isGenerating}
      />

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
