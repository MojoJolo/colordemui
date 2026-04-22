import { useEffect, useRef, useState } from "react";

import * as api from "./api";
import FluxKleinForm from "./components/FluxKleinForm";
import ZImageTurboForm from "./components/ZImageTurboForm";
import PVideoForm from "./components/PVideoForm";
import GrokVideoForm from "./components/GrokVideoForm";
import NanoBanana2Form from "./components/NanoBanana2Form";
import PImageLoraForm from "./components/PImageLoraForm";
import PImageEditForm from "./components/PImageEditForm";
import ImageGrid from "./components/ImageGrid";
import LoginPage from "./components/LoginPage";
import ProgressPanel from "./components/ProgressPanel";
import PromptForm from "./components/PromptForm";
import Toolbar from "./components/Toolbar";
import WorkflowConfigTab from "./components/WorkflowConfigTab";
import "./styles.css";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("auth_token"));
  // All images across all jobs — persists across page refreshes
  const [images, setImages] = useState([]);
  // Active job — only used for progress tracking while generating
  const [activeJob, setActiveJob] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [activePage, setActivePage] = useState("home");
  const [expandedImage, setExpandedImage] = useState(null);
  const [loraTriggerWord, setLoraTriggerWord] = useState("");
  const pollRef = useRef(null);

  // Listen for 401 responses from any API call
  useEffect(() => {
    function onAuthLogout() { setToken(null); }
    window.addEventListener("auth:logout", onAuthLogout);
    return () => window.removeEventListener("auth:logout", onAuthLogout);
  }, []);

  // Load all previously generated images when the page opens
  useEffect(() => {
    if (!token) return;
    api.getAllImages()
      .then(setImages)
      .catch((err) => console.error("Failed to load images:", err));
  }, [token]);

  // Close lightbox on Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") setExpandedImage(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Merge incoming job images into the global images list.
  // Updates existing entries (status changes) and appends new ones.
  function mergeJobImages(jobImages) {
    setImages((prev) => {
      const map = new Map(prev.map((img) => [img.image_id, img]));
      for (const img of jobImages) {
        map.set(img.image_id, img);
      }
      return [...map.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
    });
  }

  // Poll the active job while it is running
  useEffect(() => {
    if (!activeJob || activeJob.status === "done") {
      clearInterval(pollRef.current);
      pollRef.current = null;
      if (activeJob?.status === "done") setIsGenerating(false);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const job = await api.getJob(activeJob.job_id);
        setActiveJob((prev) => ({ ...prev, status: job.status, completed: job.completed }));
        mergeJobImages(job.images);
        if (job.status === "done") setIsGenerating(false);
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 1500);

    return () => clearInterval(pollRef.current);
  }, [activeJob?.job_id, activeJob?.status]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleGenerate(prompts, model, imageData, options = {}) {
    setError(null);
    setIsGenerating(true);
    try {
      const job = await api.createJob(prompts, model, imageData, options);
      setActiveJob({ job_id: job.job_id, status: job.status, total: job.total, completed: job.completed });
      mergeJobImages(job.images);
    } catch (err) {
      setError(err.message);
      setIsGenerating(false);
    }
  }

  async function handleSelectImage(imageId, selected) {
    try {
      await api.selectImage(imageId, selected);
      setImages((prev) =>
        prev.map((img) => img.image_id === imageId ? { ...img, selected } : img)
      );
    } catch (err) {
      console.error("Select error:", err);
    }
  }

  async function handleDeleteImage(imageId) {
    try {
      await api.deleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.image_id !== imageId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  async function handleSelectAll() {
    try {
      await api.selectAll();
      setImages((prev) => prev.map((img) => ({ ...img, selected: true })));
    } catch (err) {
      console.error("Select-all error:", err);
    }
  }

  async function handleUnselectAll() {
    try {
      await api.unselectAll();
      setImages((prev) => prev.map((img) => ({ ...img, selected: false })));
    } catch (err) {
      console.error("Unselect-all error:", err);
    }
  }

  async function handleDeleteSelected() {
    try {
      await api.deleteSelected();
      setImages((prev) => prev.filter((img) => !img.selected));
    } catch (err) {
      console.error("Delete-selected error:", err);
    }
  }

  function handleDownloadPdf() {
    window.open(api.getPdfUrl(), "_blank");
  }

  function handleDownloadLoraZip() {
    window.open(api.getLoraZipUrl(loraTriggerWord), "_blank");
  }

  async function handleLogout() {
    await api.logout();
    setToken(null);
  }

  if (!token) {
    return <LoginPage onLogin={() => setToken(localStorage.getItem("auth_token"))} />;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const selectedCount = images.filter(
    (img) => img.selected && img.status === "done"
  ).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div>
            <h1>Coloring Book Generator</h1>
            <p className="subtitle">Generate images via Replicate</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Sign out
          </button>
        </div>
        <nav className="page-tabs">
          <button
            className={`tab${activePage === "home" ? " active" : ""}`}
            onClick={() => setActivePage("home")}
            type="button"
          >
            Coloring Book
          </button>
          <button
            className={`tab${activePage === "flux-klein" ? " active" : ""}`}
            onClick={() => setActivePage("flux-klein")}
            type="button"
          >
            Flux Klein 9B
          </button>
          <button
            className={`tab${activePage === "z-turbo" ? " active" : ""}`}
            onClick={() => setActivePage("z-turbo")}
            type="button"
          >
            Z Image Turbo
          </button>
          <button
            className={`tab${activePage === "p-video" ? " active" : ""}`}
            onClick={() => setActivePage("p-video")}
            type="button"
          >
            P-Video
          </button>
          <button
            className={`tab${activePage === "p-image-lora" ? " active" : ""}`}
            onClick={() => setActivePage("p-image-lora")}
            type="button"
          >
            P-Image LoRA
          </button>
          <button
            className={`tab${activePage === "p-image-edit" ? " active" : ""}`}
            onClick={() => setActivePage("p-image-edit")}
            type="button"
          >
            P-Image Edit
          </button>
          <button
            className={`tab${activePage === "grok-video" ? " active" : ""}`}
            onClick={() => setActivePage("grok-video")}
            type="button"
          >
            Grok Video
          </button>
          <button
            className={`tab${activePage === "nano-banana-2" ? " active" : ""}`}
            onClick={() => setActivePage("nano-banana-2")}
            type="button"
          >
            Nano Banana 2
          </button>
          <button
            className={`tab${activePage === "workflow" ? " active" : ""}`}
            onClick={() => setActivePage("workflow")}
            type="button"
          >
            Workflows
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activePage === "home" && (
          <PromptForm onGenerate={handleGenerate} isGenerating={isGenerating} />
        )}
        {activePage === "flux-klein" && (
          <FluxKleinForm onGenerate={handleGenerate} isGenerating={isGenerating} images={images} />
        )}
        {activePage === "z-turbo" && (
          <ZImageTurboForm onGenerate={handleGenerate} isGenerating={isGenerating} />
        )}
        {activePage === "p-video" && (
          <PVideoForm onGenerate={handleGenerate} isGenerating={isGenerating} images={images} />
        )}
        {activePage === "p-image-lora" && (
          <PImageLoraForm onGenerate={handleGenerate} isGenerating={isGenerating} />
        )}
        {activePage === "p-image-edit" && (
          <PImageEditForm onGenerate={handleGenerate} isGenerating={isGenerating} images={images} />
        )}
        {activePage === "grok-video" && (
          <GrokVideoForm onGenerate={handleGenerate} isGenerating={isGenerating} images={images} />
        )}
        {activePage === "nano-banana-2" && (
          <NanoBanana2Form onGenerate={handleGenerate} isGenerating={isGenerating} images={images} />
        )}
        {activePage === "workflow" && (
          <WorkflowConfigTab onExpand={setExpandedImage} />
        )}

        {error && <div className="error-banner">{error}</div>}

        {activePage !== "workflow" && activeJob && <ProgressPanel job={activeJob} />}

        {activePage !== "workflow" && images.length > 0 && (
          <>
            <Toolbar
              images={images}
              selectedCount={selectedCount}
              onSelectAll={handleSelectAll}
              onUnselectAll={handleUnselectAll}
              onDeleteSelected={handleDeleteSelected}
              onDownloadPdf={handleDownloadPdf}
              triggerWord={loraTriggerWord}
              onTriggerWordChange={setLoraTriggerWord}
              onDownloadLoraZip={handleDownloadLoraZip}
            />
            <ImageGrid
              images={images}
              onSelect={handleSelectImage}
              onDelete={handleDeleteImage}
              onExpand={setExpandedImage}
            />
          </>
        )}
      </main>

      {expandedImage && (
        <div className="lightbox-backdrop" onClick={() => setExpandedImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            {expandedImage.filename?.endsWith(".mp4") ? (
              <video src={expandedImage.url} controls autoPlay loop />
            ) : (
              <img src={expandedImage.url} alt={expandedImage.prompt} />
            )}
            <button
              className="lightbox-close"
              onClick={() => setExpandedImage(null)}
              aria-label="Close"
            >
              ✕
            </button>
            {expandedImage.filename?.endsWith(".mp4") && (
              <a
                href={expandedImage.url}
                download={expandedImage.filename}
                className="lightbox-download"
                onClick={(e) => e.stopPropagation()}
                title="Download video"
                aria-label="Download video"
              >
                ↓ Download
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
