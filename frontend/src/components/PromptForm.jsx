import { useRef, useState } from "react";

const MODELS = [
  {
    id: "recraft-v3-svg",
    label: "Recraft SVG",
    description: "Text → SVG line art",
    acceptsImage: false,
  },
  {
    id: "flux-2-pro",
    label: "Flux 2 Pro",
    description: "Photo → coloring page",
    acceptsImage: true,
  },
];

// Read any image file (including HEIC) as a base64 data URL.
// Scaling and format conversion happen on the backend via Pillow.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// For non-HEIC images we still scale in the browser to keep uploads small.
const MAX_PIXELS = 1_000_000;

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

function isHeic(file) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name)
  );
}

export default function PromptForm({ onGenerate, isGenerating }) {
  const [text, setText] = useState("");
  const [model, setModel] = useState("recraft-v3-svg");
  const [refImage, setRefImage] = useState(null); // { dataUrl, w, h, label }
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const selectedModel = MODELS.find((m) => m.id === model);
  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  async function handleImageFile(file) {
    if (!file) return;
    setUploadError(null);
    try {
      if (isHeic(file)) {
        // HEIC: browsers can't render it — send raw to backend for conversion
        const dataUrl = await readFileAsDataUrl(file);
        setRefImage({ dataUrl, w: null, h: null, label: file.name });
      } else {
        // All other formats: scale in browser to keep upload small
        const result = await scaleViaCanvas(file);
        setRefImage({ ...result, label: `${result.w} × ${result.h}px` });
      }
    } catch (e) {
      console.error("Image load failed:", e);
      setUploadError("Could not load image. Please try another file.");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    handleImageFile(e.dataTransfer.files[0]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedModel.acceptsImage) {
      if (!refImage) return;
      const dataUrl = refImage.dataUrl;
      setRefImage(null);
      onGenerate(["image"], model, dataUrl);
    } else {
      const prompts = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (prompts.length === 0) return;
      onGenerate(prompts, model, null);
    }
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      {/* Model selector */}
      <div className="model-selector">
        {MODELS.map((m) => (
          <label
            key={m.id}
            className={`model-option ${model === m.id ? "active" : ""}`}
          >
            <input
              type="radio"
              name="model"
              value={m.id}
              checked={model === m.id}
              onChange={() => {
                setModel(m.id);
                if (!m.acceptsImage) setRefImage(null);
              }}
              disabled={isGenerating}
            />
            <span className="model-label">{m.label}</span>
            <span className="model-desc">{m.description}</span>
          </label>
        ))}
      </div>

      {/* Image upload — only shown for img2img models */}
      {selectedModel.acceptsImage && (
        <>
          <div
            className={`image-upload-zone ${refImage ? "has-image" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !isGenerating && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: "none" }}
              onChange={(e) => handleImageFile(e.target.files[0])}
              disabled={isGenerating}
            />
            {refImage ? (
              <div className="upload-preview">
                {/* HEIC has no browser-renderable preview */}
                {refImage.w ? (
                  <img src={refImage.dataUrl} alt="Reference" />
                ) : (
                  <div className="upload-heic-thumb">HEIC</div>
                )}
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
            ) : (
              <div className="upload-empty">
                <span className="upload-icon">↑</span>
                <span>Drop an image or click to upload</span>
                <span className="upload-hint">JPEG, PNG, HEIC supported</span>
              </div>
            )}
          </div>
          {uploadError && <p className="upload-error">{uploadError}</p>}
        </>
      )}

      {/* Prompts textarea — hidden for img2img models */}
      {!selectedModel.acceptsImage && (
        <>
          <label htmlFor="prompts-input" className="prompt-label">
            Prompts{" "}
            <span className="prompt-count">
              {lineCount > 0 ? `(${lineCount} prompt${lineCount !== 1 ? "s" : ""})` : ""}
            </span>
          </label>
          <textarea
            id="prompts-input"
            className="prompt-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="a cute cat sitting in a flower garden&#10;a dragon flying over mountains&#10;a cozy cottage with a rose trellis"
            rows={8}
            disabled={isGenerating}
          />
        </>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={
          isGenerating ||
          (selectedModel.acceptsImage ? !refImage : lineCount === 0)
        }
      >
        {isGenerating ? "Generating…" : "Generate Images"}
      </button>
    </form>
  );
}
