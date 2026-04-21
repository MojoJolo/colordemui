import { useState } from "react";

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16", desc: "TikTok" },
  { value: "1:1",  label: "1:1",  desc: "Square" },
  { value: "4:5",  label: "4:5",  desc: "Portrait" },
  { value: "16:9", label: "16:9", desc: "Wide" },
  { value: "3:4",  label: "3:4",  desc: "Classic" },
  { value: "2:3",  label: "2:3",  desc: "Story" },
];

export default function ZImageTurboForm({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("4:5");

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const text = prompt.trim();
    setPrompt("");
    onGenerate([text], "z-image-turbo", null, { aspectRatio });
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">z-image-turbo</span>
        <span className="klein-model-desc">Fast text-to-image</span>
      </div>

      <label htmlFor="z-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="z-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the image you want to generate…"
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

      <button
        type="submit"
        className="btn btn-primary"
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? "Generating…" : "Generate"}
      </button>
    </form>
  );
}
