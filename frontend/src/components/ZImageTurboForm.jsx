import { useState } from "react";

export default function ZImageTurboForm({ onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const text = prompt.trim();
    setPrompt("");
    onGenerate([text], "z-image-turbo", null);
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">z-image-turbo</span>
        <span className="klein-model-desc">Fast text-to-image · 1088×1360</span>
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
