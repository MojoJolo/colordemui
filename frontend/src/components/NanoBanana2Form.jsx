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
  const [refImage, setRefImage] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [seed, setSeed] = useState("");
  const [numOutputs, setNumOutputs] = useState(1);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const candidates = images.filter(
    (img) => img.status === "done" && img.url && !img.filename?.endsWith(".mp4")
  );

  async function handleGalleryToggle(img) {
    if (refImage?.galleryId === img.image_id) {
      setRefImage(null);
      return;
    }
    try {
      const { dataUrl, w, h } = await scaleFromUrl(img.url);
      const label = img.prompt.length > 40 ? img.prompt.slice(0, 40) + "…" : img.prompt;
      setRefImage({ dataUrl, w, h, label, galleryId: img.image_id });
    } catch (e) {
      console.error("Failed to load gallery image:", e);
    }
  }

  async function handleImageFile(file) {
    if (!file) return;
    setUploadError(null);
    try {
      const { dataUrl, w, h } = await scaleViaCanvas(file);
      setRefImage({ dataUrl, w, h, label: `${w} × ${h}px` });
    } catch (e) {
      setUploadError("Could not load image. Please try another file.");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    handleImageFile(e.dataTransfer.files?.[0]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const dataUrls = refImage ? [refImage.dataUrl] : null;
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
        <span className="klein-model-desc">Text-to-image · optional reference · Gemini 3.1 Flash</span>
      </div>

      {candidates.length > 0 && (
        <>
          <label className="prompt-label">
            From Gallery <span className="pvideo-optional">(optional reference)</span>
          </label>
          <div className="pvideo-picker">
            {candidates.map((img) => (
              <div
                key={img.image_id}
                className={`pvideo-thumb${refImage?.galleryId === img.image_id ? " selected" : ""}`}
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
        Reference Image <span className="pvideo-optional">(optional)</span>
      </label>
      <div
        className={`image-upload-zone ${refImage ? "has-image" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isGenerating && !refImage && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { handleImageFile(e.target.files?.[0]); e.target.value = ""; }}
          disabled={isGenerating || !!refImage}
        />
        {refImage ? (
          <div className="upload-preview-grid">
            <div className="upload-preview">
              <img src={refImage.dataUrl} alt="Reference" />
              <div className="upload-preview-info">
                <span>{refImage.label}</span>
                {!isGenerating && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => { e.stopPropagation(); setRefImage(null); }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="upload-empty">
            <span className="upload-icon">↑</span>
            <span>Drop an image or click to upload</span>
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
