import { useState } from "react";
import { isPickableImage } from "../mediaTypes";
import FrameSlot from "./FrameSlot";

export default function Gpt5NanoForm({ onGenerate, isGenerating, images = [] }) {
  const [prompt, setPrompt] = useState("");
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState(null);

  const candidates = images.filter(isPickableImage);

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate([prompt.trim()], "gpt-5-nano", null, {
      selectedImageId: uploadedDataUrl ? undefined : (selectedImageId || undefined),
      firstFrameData: uploadedDataUrl || undefined,
    });
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">gpt-5-nano</span>
        <span className="klein-model-desc">Text generation · prompt + optional image</span>
      </div>

      <FrameSlot
        label="Reference Image"
        optional
        candidates={candidates}
        selectedId={selectedImageId}
        onSelectId={setSelectedImageId}
        uploadedDataUrl={uploadedDataUrl}
        onUpload={(dataUrl) => { setUploadedDataUrl(dataUrl); setSelectedImageId(null); }}
        onClearUpload={() => setUploadedDataUrl(null)}
        disabled={isGenerating}
      />

      <label htmlFor="gpt5-prompt" className="prompt-label">Prompt</label>
      <textarea
        id="gpt5-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. 'Describe this image as a one-sentence image prompt'"
        rows={4}
        disabled={isGenerating}
      />

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {isGenerating ? "Generating…" : "Generate Text"}
      </button>
    </form>
  );
}
