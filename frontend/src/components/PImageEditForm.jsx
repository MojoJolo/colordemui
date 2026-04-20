import { useRef, useState } from "react";
import { getImageUrl } from "../api";

const ASPECT_RATIOS = [
  { value: "match_input_image", label: "Match", desc: "Input" },
  { value: "1:1",  label: "1:1",  desc: "Square" },
  { value: "16:9", label: "16:9", desc: "Wide" },
  { value: "9:16", label: "9:16", desc: "Reels" },
  { value: "4:3",  label: "4:3",  desc: "Classic" },
  { value: "3:4",  label: "3:4",  desc: "Portrait" },
  { value: "3:2",  label: "3:2",  desc: "Photo" },
  { value: "2:3",  label: "2:3",  desc: "Story" },
];

const EDIT_PRESETS = [
  { value: "", label: "None" },
  { value: "relight", label: "Relight" },
  { value: "light_restoration", label: "Light Restoration" },
  { value: "white_to_scene", label: "White to Scene" },
  { value: "fusion", label: "Fusion" },
  { value: "add_characters", label: "Add Characters" },
  { value: "next_scene", label: "Next Scene" },
  { value: "style_consistency", label: "Style Consistency" },
  { value: "subject_consistency", label: "Subject Consistency" },
  { value: "scene_consistency", label: "Scene Consistency" },
  { value: "to_anime", label: "To Anime" },
  { value: "to_3dchibi", label: "To 3D Chibi" },
  { value: "to_caricature", label: "To Caricature" },
  { value: "photous", label: "Photous" },
  { value: "extract_texture", label: "Extract Texture" },
  { value: "apply_texture", label: "Apply Texture" },
  { value: "upscale", label: "Upscale" },
  { value: "anything_to_real", label: "Anything to Real" },
  { value: "white_film_to_rendering", label: "White Film to Rendering" },
];

const MAX_PIXELS = 1_000_000;
const MAX_IMAGES = 5;

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

export default function PImageEditForm({ onGenerate, isGenerating, images = [] }) {
  const [refImages, setRefImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("match_input_image");
  const [editPreset, setEditPreset] = useState("");
  const [seed, setSeed] = useState("");
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
    if (slots <= 0) return;
    try {
      const results = await Promise.all(
        Array.from(files).slice(0, slots).map(async (file) => {
          if (isHeic(file)) {
            const dataUrl = await readFileAsDataUrl(file);
            return { dataUrl, w: null, h: null, label: file.name };
          }
          const result = await scaleViaCanvas(file);
          return { ...result, label: `${result.w} × ${result.h}px` };
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

  function handleSubmit(e) {
    e.preventDefault();
    if (refImages.length === 0 || !prompt.trim()) return;
    const dataUrls = refImages.map((img) => img.dataUrl);
    const parsedSeed = seed.trim() !== "" ? parseInt(seed, 10) : null;
    onGenerate(
      [prompt.trim()],
      "p-image-edit",
      dataUrls,
      {
        loraWeights: editPreset || null,
        aspectRatio,
        seed: parsedSeed,
        numOutputs: 1,
      }
    );
  }

  const canSubmit = !isGenerating && refImages.length > 0 && prompt.trim().length > 0;

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="klein-form-header">
        <span className="klein-model-badge">p-image-edit</span>
        <span className="klein-model-desc">Image editing — 1–5 images + prompt</span>
      </div>

      {/* Gallery picker */}
      {candidates.length > 0 && (
        <>
          <label className="prompt-label">
            From Gallery{" "}
            <span className="pvideo-optional">(click to add — first image is edited)</span>
          </label>
          <div className="pvideo-picker">
            {candidates.map((img) => (
              <div
                key={img.image_id}
                className={`pvideo-thumb${addedGalleryIds.has(img.image_id) ? " selected" : ""}${atLimit && !addedGalleryIds.has(img.image_id) ? " pvideo-picker-dim" : ""}`}
                onClick={() => !isGenerating && handleGalleryToggle(img)}
                title={img.prompt}
              >
                <img src={getImageUrl(img.url)} alt={img.prompt} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upload zone */}
      <label className="prompt-label">
        Upload Images
        <span className="pvideo-optional"> ({refImages.length}/{MAX_IMAGES} — first is edit target)</span>
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
          accept="image/*,.heic,.heif"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }}
          disabled={isGenerating || atLimit}
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
                  <span>{i === 0 ? "✏️ Edit target" : `Ref ${i}`} · {img.label}</span>
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
            {!isGenerating && !atLimit && (
              <div className="upload-add-more">
                <span className="upload-icon">+</span>
                <span>Add reference</span>
              </div>
            )}
          </div>
        ) : (
          <div className="upload-empty">
            <span className="upload-icon">↑</span>
            <span>Drop images or click to upload</span>
            <span className="upload-hint">First image will be edited · up to 5 total</span>
          </div>
        )}
      </div>
      {uploadError && <p className="upload-error">{uploadError}</p>}

      {/* Prompt */}
      <label htmlFor="pedit-prompt" className="prompt-label">Edit Instruction</label>
      <textarea
        id="pedit-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the edit, e.g. 'turn this into anime style'"
        rows={3}
        disabled={isGenerating}
      />

      {/* Edit Preset */}
      <label htmlFor="pedit-preset" className="prompt-label">
        Edit Preset <span className="pvideo-optional">(optional)</span>
      </label>
      <select
        id="pedit-preset"
        className="lora-text-input"
        value={editPreset}
        onChange={(e) => setEditPreset(e.target.value)}
        disabled={isGenerating}
      >
        {EDIT_PRESETS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

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

      {/* Seed */}
      <div className="klein-options-row">
        <div className="klein-option">
          <label htmlFor="pedit-seed" className="prompt-label">Seed</label>
          <input
            id="pedit-seed"
            type="number"
            className="klein-input"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            min="0"
            disabled={isGenerating}
          />
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {isGenerating ? "Generating…" : "Edit Image"}
      </button>
    </form>
  );
}
