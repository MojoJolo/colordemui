import { useState } from "react";
import { isPickableImage } from "../mediaTypes";
import FrameSlot from "./FrameSlot";

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

  const candidates = images.filter(isPickableImage);

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
        max={30}
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
