import { useEffect, useRef, useState } from "react";

import * as api from "./api";
import ImageGrid from "./components/ImageGrid";
import ProgressPanel from "./components/ProgressPanel";
import PromptForm from "./components/PromptForm";
import Toolbar from "./components/Toolbar";
import "./styles.css";

export default function App() {
  // All images across all jobs — persists across page refreshes
  const [images, setImages] = useState([]);
  // Active job — only used for progress tracking while generating
  const [activeJob, setActiveJob] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Load all previously generated images when the page opens
  useEffect(() => {
    api.getAllImages()
      .then(setImages)
      .catch((err) => console.error("Failed to load images:", err));
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

  async function handleGenerate(prompts, model, imageData) {
    setError(null);
    setIsGenerating(true);
    try {
      const job = await api.createJob(prompts, model, imageData);
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const selectedCount = images.filter(
    (img) => img.selected && img.status === "done"
  ).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Coloring Book Generator</h1>
        <p className="subtitle">
          Generate SVG line-art images from text prompts via Replicate
        </p>
      </header>

      <main className="app-main">
        <PromptForm onGenerate={handleGenerate} isGenerating={isGenerating} />

        {error && <div className="error-banner">{error}</div>}

        {activeJob && <ProgressPanel job={activeJob} />}

        {images.length > 0 && (
          <>
            <Toolbar
              images={images}
              selectedCount={selectedCount}
              onSelectAll={handleSelectAll}
              onUnselectAll={handleUnselectAll}
              onDeleteSelected={handleDeleteSelected}
              onDownloadPdf={handleDownloadPdf}
            />
            <ImageGrid
              images={images}
              onSelect={handleSelectImage}
              onDelete={handleDeleteImage}
            />
          </>
        )}
      </main>
    </div>
  );
}
