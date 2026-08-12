import { useState } from "react";

const DURATIONS = [
  { value: 5,  desc: "Quick" },
  { value: 10, desc: "Standard" },
  { value: 15, desc: "Long" },
];

const ASPECT_RATIOS = [
  { value: "9:16",  label: "9:16",  desc: "Reels" },
  { value: "16:9",  label: "16:9",  desc: "Wide" },
  { value: "1:1",   label: "1:1",   desc: "Square" },
  { value: "4:3",   label: "4:3",   desc: "Classic" },
  { value: "3:4",   label: "3:4",   desc: "Portrait" },
  { value: "21:9",  label: "21:9",  desc: "Cinema" },
];

export default function MinimaxH3Form({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate([prompt.trim()], "minimax-h3", null, { duration, aspectRatio });
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">minimax-h3</span>
        <span className="klein-model-desc">Text-to-video · 2K with audio, via fal.ai</span>
      </div>

      <label className="prompt-label">Duration</label>
      <div className="pvideo-aspect-grid">
        {DURATIONS.map(({ value, desc }) => (
          <button
            key={value}
            type="button"
            className={`pvideo-aspect-btn${duration === value ? " selected" : ""}`}
            onClick={() => setDuration(value)}
            disabled={isGenerating}
          >
            <span className="pvideo-aspect-ratio">{value}s</span>
            <span className="pvideo-aspect-desc">{desc}</span>
          </button>
        ))}
      </div>

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

      <label htmlFor="minimax-h3-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="minimax-h3-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the scene, the motion, and the audio…"
        rows={4}
        disabled={isGenerating}
      />
      <span className="klein-model-desc">
        Rendering at 2K takes several minutes and blocks other generation while it runs.
      </span>

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
