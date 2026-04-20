import { useRef, useState } from "react";
import { getImageUrl } from "../api";

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16", desc: "TikTok" },
  { value: "1:1",  label: "1:1",  desc: "Square" },
  { value: "4:5",  label: "4:5",  desc: "Portrait" },
  { value: "16:9", label: "16:9", desc: "Wide" },
  { value: "3:4",  label: "3:4",  desc: "Classic" },
  { value: "2:3",  label: "2:3",  desc: "Story" },
];

const MAX_PIXELS = 1_000_000;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function scaleViaCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const total = img.width * img.height;
      let w = img.width;
      let h = img.height;
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
      let w = img.width;
      let h = img.height;
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

function isHeic(file) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name)
  );
}

export default function FluxKleinForm({ onGenerate, isGenerating, images = [] }) {
  const [refImages, setRefImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [numOutputs, setNumOutputs] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const candidates = images.filter(
    (img) => img.status === "done" && img.url && !img.filename?.endsWith(".mp4")
  );

  // Set of gallery image_ids already added as ref images
  const addedGalleryIds = new Set(
    refImages.filter((r) => r.galleryId).map((r) => r.galleryId)
  );

  async function handleGalleryToggle(img) {
    if (addedGalleryIds.has(img.image_id)) {
      setRefImages((prev) => prev.filter((r) => r.galleryId !== img.image_id));
      return;
    }
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
    try {
      const results = await Promise.all(
        Array.from(files).map(async (file) => {
          if (isHeic(file)) {
            const dataUrl = await readFileAsDataUrl(file);
            return { dataUrl, w: null, h: null, label: file.name };
          } else {
            const result = await scaleViaCanvas(file);
            return { ...result, label: `${result.w} × ${result.h}px` };
          }
        })
      );
      setRefImages((prev) => [...prev, ...results]);
    } catch (e) {
      console.error("Image load failed:", e);
      setUploadError("Could not load image. Please try another file.");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    handleImageFiles(e.dataTransfer.files);
  }

  const parsedPrompts = prompt
    .split("=====")
    .map((p) => p.trim())
    .filter(Boolean);

  function handleSubmit(e) {
    e.preventDefault();
    if (refImages.length === 0 || parsedPrompts.length === 0) return;

    const dataUrls = refImages.map((img) => img.dataUrl);
    const parsedSeed = seed.trim() !== "" ? parseInt(seed, 10) : null;

    setPrompt("");
    setSeed("");
    setNumOutputs(1);

    onGenerate(
      parsedPrompts,
      "flux-2-klein-9b",
      dataUrls,
      { seed: parsedSeed, numOutputs, aspectRatio }
    );
  }

  const canSubmit = !isGenerating && refImages.length > 0 && parsedPrompts.length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">flux-2-klein-9b</span>
        <span className="klein-model-desc">Multi-reference image generation</span>
      </div>

      {/* Gallery picker */}
      {candidates.length > 0 && (
        <>
          <label className="prompt-label">
            From Gallery <span className="pvideo-optional">(click to add as reference)</span>
          </label>
          <div className="pvideo-picker">
            {candidates.map((img) => (
              <div
                key={img.image_id}
                className={`pvideo-thumb${addedGalleryIds.has(img.image_id) ? " selected" : ""}`}
                onClick={() => !isGenerating && handleGalleryToggle(img)}
                title={img.prompt}
              >
                <img src={getImageUrl(img.url)} alt={img.prompt} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reference image upload */}
      <label className="prompt-label">Upload Reference Images</label>
      <div
        className={`image-upload-zone ${refImages.length > 0 ? "has-image" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isGenerating && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }}
          disabled={isGenerating}
        />
        {refImages.length > 0 ? (
          <div className="upload-preview-grid">
            {refImages.map((img, i) => (
              <div key={i} className="upload-preview">
                {img.w ? (
                  <img src={img.dataUrl} alt="Reference" />
                ) : (
                  <div className="upload-heic-thumb">HEIC</div>
                )}
                <div className="upload-preview-info">
                  <span>{img.label}</span>
                  {!isGenerating && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRefImages((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!isGenerating && (
              <div className="upload-add-more">
                <span className="upload-icon">+</span>
                <span>Add more</span>
              </div>
            )}
          </div>
        ) : (
          <div className="upload-empty">
            <span className="upload-icon">↑</span>
            <span>Drop images or click to upload</span>
            <span className="upload-hint">JPEG, PNG, HEIC supported — multiple allowed</span>
          </div>
        )}
      </div>
      {uploadError && <p className="upload-error">{uploadError}</p>}

      {/* Prompt */}
      <label htmlFor="klein-prompt" className="prompt-label">
        Prompt
        {parsedPrompts.length > 1 && (
          <span className="klein-prompt-count">
            {parsedPrompts.length} prompts · {parsedPrompts.length * numOutputs} images total
          </span>
        )}
      </label>
      <textarea
        id="klein-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={"Describe what you want to generate…\n\n=====\n\nAnother prompt (optional)"}
        rows={5}
        disabled={isGenerating}
      />

      {/* Seed + Num outputs row */}
      <div className="klein-options-row">
        <div className="klein-option">
          <label htmlFor="klein-seed" className="prompt-label">Seed</label>
          <input
            id="klein-seed"
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
          <label htmlFor="klein-num-outputs" className="prompt-label">Images</label>
          <input
            id="klein-num-outputs"
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

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
      >
        {isGenerating
          ? "Generating…"
          : parsedPrompts.length > 1
            ? `Generate ${parsedPrompts.length * numOutputs} Images (${parsedPrompts.length} × ${numOutputs})`
            : `Generate ${numOutputs} Image${numOutputs !== 1 ? "s" : ""}`
        }
      </button>
    </form>
  );
}
