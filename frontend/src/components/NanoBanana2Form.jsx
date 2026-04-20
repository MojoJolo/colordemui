import { useRef, useState } from "react";

const ASPECT_RATIOS = [
  { value: "9:16",  label: "9:16",  desc: "Reels" },
  { value: "1:1",   label: "1:1",   desc: "Square" },
  { value: "16:9",  label: "16:9",  desc: "Wide" },
  { value: "4:3",   label: "4:3",   desc: "Classic" },
  { value: "3:4",   label: "3:4",   desc: "Portrait" },
  { value: "3:2",   label: "3:2",   desc: "Photo" },
  { value: "2:3",   label: "2:3",   desc: "Story" },
];

const MAX_PIXELS = 1_000_000;
const MAX_IMAGES = 4;

function scaleViaCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const total = img.width * img.height;
      let w = img.width, h = img.height;
      if (total > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / total);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/png"), w, h });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function scaleFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const total = img.width * img.height;
      let w = img.width, h = img.height;
      if (total > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / total);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/png"), w, h });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function NanoBanana2Form({ onGenerate, isGenerating, images = [] }) {
  const [refImages, setRefImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [seed, setSeed] = useState("");
  const [numOutputs, setNumOutputs] = useState(1);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const candidates = images.filter(
    (img) => img.status === "done" && img.url && !img.filename?.endsWith(".mp4")
  );

  const addedGalleryIds = new Set(
    refImages.filter((r) => r.galleryId).map((r) => r.galleryId)
  );

  const atLimit = refImages.length >= MAX_IMAGES;

  async function handleGalleryToggle(img) {
    if (addedGalleryIds.has(img.image_id)) {
      setRefImages((prev) => prev.filter((r) => r.galleryId !== img.image_id));
      return;
    }
    if (atLimit) return;
    try {
      const { dataUrl, w, h } = await scaleFromUrl(img.url);
      const label = img.prompt.length > 40 ? img.prompt.slice(0, 40) + "…" : img.prompt;
      setRefImages((prev) => [...prev, { dataUrl, w, h, label, galleryId: img.image_id }]);
    } catch (e) {
      console.error("Failed to load gallery image:", e);
    }
  }

  async function handleImageFiles(files) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const slots = MAX_IMAGES - refImages.length;
    const toProcess = Array.from(files).slice(0, slots);
    const results = [];
    for (const file of toProcess) {
      try {
        const { dataUrl, w, h } = await scaleViaCanvas(file);
        results.push({ dataUrl, w, h, label: `${w} × ${h}px` });
      } catch {
        setUploadError("Could not load one or more images. Please try different files.");
      }
    }
    if (results.length > 0) {
      setRefImages((prev) => [...prev, ...results]);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    handleImageFiles(e.dataTransfer.files);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const dataUrls = refImages.length > 0 ? refImages.map((r) => r.dataUrl) : null;
    const parsedSeed = seed.trim() !== "" ? parseInt(seed, 10) : null;
    onGenerate(
      [prompt.trim()],
      "nano-banana-2",
      dataUrls,
      { aspectRatio, seed: parsedSeed, numOutputs }
    );
  }

  const canSubmit = !isGenerating && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">nano-banana-2</span>
        <span className="klein-model-desc">Text-to-image · optional references · Gemini 3.1 Flash</span>
      </div>

      {candidates.length > 0 && (
        <>
          <label className="prompt-label">
            From Gallery <span className="pvideo-optional">(optional, up to {MAX_IMAGES})</span>
          </label>
          <div className="pvideo-picker">
            {candidates.map((img) => (
              <div
                key={img.image_id}
                className={`pvideo-thumb${addedGalleryIds.has(img.image_id) ? " selected" : ""}${atLimit && !addedGalleryIds.has(img.image_id) ? " disabled" : ""}`}
                onClick={() => !isGenerating && handleGalleryToggle(img)}
                title={img.prompt}
              >
                <img src={img.url} alt={img.prompt} />
              </div>
            ))}
          </div>
        </>
      )}

      <label className="prompt-label">
        Reference Images <span className="pvideo-optional">(optional, up to {MAX_IMAGES})</span>
      </label>
      <div
        className={`image-upload-zone ${refImages.length > 0 ? "has-image" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isGenerating && !atLimit && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }}
          disabled={isGenerating || atLimit}
        />
        {refImages.length > 0 ? (
          <div className="upload-preview-grid">
            {refImages.map((img, i) => (
              <div key={i} className="upload-preview">
                <img src={img.dataUrl} alt={`Reference ${i + 1}`} />
                <div className="upload-preview-info">
                  <span>{img.label}</span>
                  {!isGenerating && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); setRefImages((prev) => prev.filter((_, j) => j !== i)); }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!atLimit && !isGenerating && (
              <div
                className="upload-preview upload-preview-add"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <span className="upload-icon">+</span>
                <span>Add image</span>
              </div>
            )}
          </div>
        ) : (
          <div className="upload-empty">
            <span className="upload-icon">↑</span>
            <span>Drop images or click to upload</span>
            <span className="upload-hint">Optional — guides the generation style</span>
          </div>
        )}
      </div>
      {uploadError && <p className="upload-error">{uploadError}</p>}

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
