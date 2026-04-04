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
  const [refImages, setRefImages] = useState([]); // [{ dataUrl, w, h, label }]
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const selectedModel = MODELS.find((m) => m.id === model);
  const lineCount = text.split("\n").filter((l) => l.trim()).length;

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

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedModel.acceptsImage) {
      if (refImages.length === 0) return;
      const dataUrls = refImages.map((img) => img.dataUrl);
      setRefImages([]);
      onGenerate(refImages.map(() => "image"), model, dataUrls);
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
                if (!m.acceptsImage) setRefImages([]);
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
          (selectedModel.acceptsImage ? refImages.length === 0 : lineCount === 0)
        }
      >
        {isGenerating ? "Generating…" : "Generate Images"}
      </button>
    </form>
  );
}
