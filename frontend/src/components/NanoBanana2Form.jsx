import { useState } from "react";

const ASPECT_RATIOS = [
  { value: "9:16",  label: "9:16",  desc: "Reels" },
  { value: "1:1",   label: "1:1",   desc: "Square" },
  { value: "16:9",  label: "16:9",  desc: "Wide" },
  { value: "4:3",   label: "4:3",   desc: "Classic" },
  { value: "3:4",   label: "3:4",   desc: "Portrait" },
  { value: "3:2",   label: "3:2",   desc: "Photo" },
  { value: "2:3",   label: "2:3",   desc: "Story" },
];

export default function NanoBanana2Form({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [seed, setSeed] = useState("");
  const [numOutputs, setNumOutputs] = useState(1);

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const parsedSeed = seed.trim() !== "" ? parseInt(seed, 10) : null;
    onGenerate(
      [prompt.trim()],
      "nano-banana-2",
      null,
      { aspectRatio, seed: parsedSeed, numOutputs }
    );
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">nano-banana-2</span>
        <span className="klein-model-desc">Text-to-image · Gemini 3.1 Flash</span>
      </div>

      <label htmlFor="nb2-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="nb2-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the coloring book subject, e.g. 'a friendly dragon in a meadow'"
        rows={4}
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

      <div className="klein-options-row">
        <div className="klein-option">
          <label htmlFor="nb2-seed" className="prompt-label">Seed</label>
          <input
            id="nb2-seed"
            type="number"
            className="klein-input"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            min="0"
            disabled={isGenerating}
          />
        </div>
        <div className="klein-option">
          <label htmlFor="nb2-num-outputs" className="prompt-label">Images</label>
          <input
            id="nb2-num-outputs"
            type="number"
            className="klein-input"
            value={numOutputs}
            onChange={(e) => setNumOutputs(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))}
            min="1"
            max="4"
            disabled={isGenerating}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {isGenerating ? "Generating…" : `Generate ${numOutputs} Image${numOutputs !== 1 ? "s" : ""}`}
      </button>
    </form>
  );
}
