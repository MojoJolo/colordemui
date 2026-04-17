import { useState } from "react";

const ASPECT_RATIOS = [
  { value: "9:16",  label: "9:16",  desc: "Reels" },
  { value: "1:1",   label: "1:1",   desc: "Square" },
  { value: "4:3",   label: "4:3",   desc: "Classic" },
  { value: "16:9",  label: "16:9",  desc: "Wide" },
  { value: "3:4",   label: "3:4",   desc: "Portrait" },
  { value: "2:3",   label: "2:3",   desc: "Story" },
  { value: "3:2",   label: "3:2",   desc: "Photo" },
];

export default function PImageLoraForm({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState("");
  const [loraWeights, setLoraWeights] = useState("");
  const [hfApiToken, setHfApiToken] = useState("");
  const [loraScale, setLoraScale] = useState(0.5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [seed, setSeed] = useState("");
  const [numOutputs, setNumOutputs] = useState(1);
  const [promptUpsampling, setPromptUpsampling] = useState(false);

  const parsedPrompts = prompt
    .split("=====")
    .map((p) => p.trim())
    .filter(Boolean);

  function handleSubmit(e) {
    e.preventDefault();
    if (parsedPrompts.length === 0) return;
    const parsedSeed = seed.trim() !== "" ? parseInt(seed, 10) : null;
    onGenerate(parsedPrompts, "p-image-lora", null, {
      loraWeights: loraWeights.trim() || null,
      hfApiToken: hfApiToken.trim() || null,
      loraScale,
      aspectRatio,
      seed: parsedSeed,
      numOutputs,
      promptUpsampling,
    });
  }

  const canSubmit = !isGenerating && parsedPrompts.length > 0;
  const totalImages = parsedPrompts.length * numOutputs;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">p-image-lora</span>
        <span className="klein-model-desc">Text-to-image with LoRA weights</span>
      </div>

      {/* LoRA Weights */}
      <label htmlFor="lora-weights" className="prompt-label">
        LoRA Weights <span className="pvideo-optional">(optional)</span>
      </label>
      <input
        id="lora-weights"
        type="text"
        className="lora-text-input"
        value={loraWeights}
        onChange={(e) => setLoraWeights(e.target.value)}
        placeholder="huggingface.co/owner/model-name"
        disabled={isGenerating}
      />

      {/* HF API Token */}
      <label htmlFor="hf-api-token" className="prompt-label">
        HuggingFace API Token <span className="pvideo-optional">(for private LoRAs)</span>
      </label>
      <input
        id="hf-api-token"
        type="password"
        className="lora-text-input"
        value={hfApiToken}
        onChange={(e) => setHfApiToken(e.target.value)}
        placeholder="hf_…"
        disabled={isGenerating}
      />

      {/* LoRA Scale */}
      <div className="pvideo-duration-row">
        <span className="prompt-label">LoRA Scale</span>
        <span className="pvideo-duration-value">{loraScale.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="pvideo-duration-slider"
        value={loraScale}
        min={-1}
        max={3}
        step={0.05}
        onChange={(e) => setLoraScale(parseFloat(e.target.value))}
        disabled={isGenerating}
      />

      {/* Aspect Ratio */}
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
      <label htmlFor="lora-prompt" className="prompt-label">
        Prompt
        {parsedPrompts.length > 1 && (
          <span className="klein-prompt-count">
            {parsedPrompts.length} prompts · {totalImages} images total
          </span>
        )}
      </label>
      <textarea
        id="lora-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={"Describe the image…\n\n=====\n\nAnother prompt (optional)"}
        rows={5}
        disabled={isGenerating}
      />

      {/* Seed + Num outputs + Prompt upsampling */}
      <div className="klein-options-row">
        <div className="klein-option">
          <label htmlFor="lora-seed" className="prompt-label">Seed</label>
          <input
            id="lora-seed"
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
          <label htmlFor="lora-num-outputs" className="prompt-label">Images</label>
          <input
            id="lora-num-outputs"
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

      {/* Prompt upsampling toggle */}
      <label className="pvideo-toggle-label">
        <input
          type="checkbox"
          checked={promptUpsampling}
          onChange={(e) => setPromptUpsampling(e.target.checked)}
          disabled={isGenerating}
        />
        <span>Prompt upsampling (LLM rewrite)</span>
      </label>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
      >
        {isGenerating
          ? "Generating…"
          : parsedPrompts.length > 1
            ? `Generate ${totalImages} Images (${parsedPrompts.length} × ${numOutputs})`
            : `Generate ${numOutputs} Image${numOutputs !== 1 ? "s" : ""}`
        }
      </button>
    </form>
  );
}
