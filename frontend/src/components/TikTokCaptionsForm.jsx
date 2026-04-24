import { useRef, useState } from "react";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TikTokCaptionsForm({ onGenerate, isGenerating }) {
  const [videoDataUrl, setVideoDataUrl] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [language, setLanguage] = useState("english");
  const [captionSize, setCaptionSize] = useState(40);
  const [initialPrompt, setInitialPrompt] = useState("");
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file || !file.type.startsWith("video/")) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setVideoDataUrl(dataUrl);
      setVideoName(file.name);
    } catch (e) {
      console.error("Failed to load video:", e);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!videoDataUrl) return;
    onGenerate([initialPrompt.trim()], "tiktok-captions", null, {
      firstFrameData: videoDataUrl,
      language,
      captionSize,
    });
  }

  const canSubmit = !isGenerating && !!videoDataUrl;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">tiktok-captions</span>
        <span className="klein-model-desc">Burn TikTok-style captions into a video</span>
      </div>

      <label className="prompt-label">Video (required)</label>
      {videoDataUrl ? (
        <div className="pvideo-upload-preview">
          <video src={videoDataUrl} muted playsInline controls style={{ maxWidth: "100%", maxHeight: "220px" }} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #888)", marginTop: "4px", display: "block" }}>
            {videoName}
          </span>
          {!isGenerating && (
            <button
              type="button"
              className="pvideo-upload-clear"
              onClick={() => { setVideoDataUrl(null); setVideoName(""); }}
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div
          className="pvideo-upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !isGenerating && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            disabled={isGenerating}
          />
          <span className="pvideo-upload-icon">↑</span>
          <span className="pvideo-upload-hint">Drop or click to upload a video</span>
        </div>
      )}

      <label htmlFor="tiktok-language" className="prompt-label" style={{ marginTop: "16px" }}>Language</label>
      <input
        id="tiktok-language"
        type="text"
        className="prompt-textarea"
        style={{ resize: "none", height: "auto", padding: "8px 12px" }}
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        placeholder="english, french, auto…"
        disabled={isGenerating}
      />

      <label className="prompt-label" style={{ marginTop: "16px" }}>
        Caption Size
        <span className="pvideo-duration-value" style={{ marginLeft: "8px" }}>{captionSize}</span>
      </label>
      <input
        type="range"
        className="pvideo-duration-slider"
        value={captionSize}
        min={10}
        max={100}
        step={5}
        onChange={(e) => setCaptionSize(Number(e.target.value))}
        disabled={isGenerating}
      />

      <label htmlFor="tiktok-initial-prompt" className="prompt-label" style={{ marginTop: "16px" }}>
        Initial Prompt <span className="pvideo-optional">(optional)</span>
      </label>
      <textarea
        id="tiktok-initial-prompt"
        className="prompt-textarea"
        value={initialPrompt}
        onChange={(e) => setInitialPrompt(e.target.value)}
        placeholder="Optional hint for Whisper's first transcription window…"
        rows={2}
        disabled={isGenerating}
      />

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
        style={{ marginTop: "16px" }}
      >
        {isGenerating ? "Processing…" : "Add Captions"}
      </button>
    </form>
  );
}
