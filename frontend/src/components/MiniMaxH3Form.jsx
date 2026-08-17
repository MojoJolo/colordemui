import { useState } from "react";
import { isPickableImage } from "../mediaTypes";
import FrameSlot from "./FrameSlot";

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9", desc: "Wide" },
  { value: "9:16", label: "9:16", desc: "Reels" },
  { value: "1:1",  label: "1:1",  desc: "Square" },
  { value: "4:3",  label: "4:3",  desc: "Classic" },
  { value: "3:4",  label: "3:4",  desc: "Portrait" },
];

const RESOLUTIONS = ["768P", "1080P", "2K"];

// h3 is known to accept 5s and 10s; the backend clamps to this range too.
const MIN_DURATION = 1;
const MAX_DURATION = 10;

/** One URL per line — blank lines are dropped (the backend trims them too). */
function parseUrls(text) {
  return text
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
}

export default function MiniMaxH3Form({ onGenerate, isGenerating, images }) {
  const [prompt, setPrompt] = useState("");

  const [selectedImageId, setSelectedImageId] = useState(null);
  const [firstFrameDataUrl, setFirstFrameDataUrl] = useState(null);

  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("768P");

  const [refImageText, setRefImageText] = useState("");
  const [refVideoText, setRefVideoText] = useState("");
  const [refAudioText, setRefAudioText] = useState("");

  const candidates = images.filter(isPickableImage);

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate([prompt.trim()], "minimax-h3", null, {
      selectedImageId: firstFrameDataUrl ? undefined : (selectedImageId || undefined),
      firstFrameData: firstFrameDataUrl || undefined,
      duration,
      aspectRatio,
      resolution,
      referenceImageUrls: parseUrls(refImageText),
      referenceVideoUrls: parseUrls(refVideoText),
      referenceAudioUrls: parseUrls(refAudioText),
    });
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">minimax-h3</span>
        <span className="klein-model-desc">Text- and image-to-video generation</span>
      </div>

      <FrameSlot
        label="First Frame Image"
        optional
        candidates={candidates}
        selectedId={selectedImageId}
        onSelectId={setSelectedImageId}
        uploadedDataUrl={firstFrameDataUrl}
        onUpload={(dataUrl) => { setFirstFrameDataUrl(dataUrl); setSelectedImageId(null); }}
        onClearUpload={() => setFirstFrameDataUrl(null)}
        disabled={isGenerating}
      />

      <label className="prompt-label">Ratio</label>
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

      <div className="pvideo-duration-row">
        <span className="prompt-label">Duration</span>
        <span className="pvideo-duration-value">{duration}s</span>
      </div>
      <input
        id="minimax-h3-duration"
        type="range"
        className="pvideo-duration-slider"
        value={duration}
        min={MIN_DURATION}
        max={MAX_DURATION}
        step={1}
        onChange={(e) => setDuration(Number(e.target.value))}
        disabled={isGenerating}
      />

      <label className="prompt-label">Resolution</label>
      <div className="pvideo-aspect-grid">
        {RESOLUTIONS.map((value) => (
          <button
            key={value}
            type="button"
            className={`pvideo-aspect-btn${resolution === value ? " selected" : ""}`}
            onClick={() => setResolution(value)}
            disabled={isGenerating}
          >
            <span className="pvideo-aspect-ratio">{value}</span>
          </button>
        ))}
      </div>

      <label htmlFor="minimax-h3-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="minimax-h3-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the video scene or motion…"
        rows={3}
        disabled={isGenerating}
      />

      {/* Reference material is passed to Replicate by URL, so these have to be
          publicly reachable — the app's own /generated files are local-only. */}
      <details className="h3-refs">
        <summary className="prompt-label">Reference URLs (optional)</summary>
        <p className="h3-refs-hint">
          One publicly reachable URL per line. Files served by this app are not
          reachable from Replicate, so paste hosted URLs.
        </p>

        <label htmlFor="h3-ref-images" className="prompt-label">Reference images</label>
        <textarea
          id="h3-ref-images"
          className="prompt-textarea"
          value={refImageText}
          onChange={(e) => setRefImageText(e.target.value)}
          placeholder="https://example.com/reference.png"
          rows={2}
          disabled={isGenerating}
        />

        <label htmlFor="h3-ref-videos" className="prompt-label">Reference videos</label>
        <textarea
          id="h3-ref-videos"
          className="prompt-textarea"
          value={refVideoText}
          onChange={(e) => setRefVideoText(e.target.value)}
          placeholder="https://example.com/reference.mp4"
          rows={2}
          disabled={isGenerating}
        />

        <label htmlFor="h3-ref-audio" className="prompt-label">Reference audio</label>
        <textarea
          id="h3-ref-audio"
          className="prompt-textarea"
          value={refAudioText}
          onChange={(e) => setRefAudioText(e.target.value)}
          placeholder="https://example.com/reference.mp3"
          rows={2}
          disabled={isGenerating}
        />
      </details>

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {isGenerating ? "Generating…" : "Generate Video"}
      </button>
    </form>
  );
}
