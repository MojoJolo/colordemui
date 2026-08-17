import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import ImageGrid from "./ImageGrid";
import { scaleViaCanvas } from "./FrameSlot";
import { isPickableImage, isTextFile, isVideoFile } from "../mediaTypes";

const DEFAULT_STEP = () => ({
  step_id: null,
  model: "recraft-v3-svg",
  num_outputs: 1,
  prompt_template: "",
  aspect_ratio: "9:16",
  duration: 5,
  resolution: "2K",
  save_audio: true,
  initial_image_ids: [],
  source_step_index: null,
  merge_source_steps: [],
  language: "english",
  caption_size: 40,
});

// Fill in fields missing from workflows saved before they existed
function normalizeStep(s) {
  return {
    ...s,
    aspect_ratio: s.aspect_ratio || "9:16",
    duration: s.duration ?? 5,
    resolution: s.resolution || "2K",
    save_audio: s.save_audio ?? true,
    initial_image_ids: s.initial_image_ids || [],
    source_step_index: s.source_step_index ?? null,
    merge_source_steps: s.merge_source_steps || [],
    language: s.language || "english",
    caption_size: s.caption_size ?? 40,
  };
}

const DEFAULT_WORKFLOW = () => ({
  name: "",
  steps: [DEFAULT_STEP()],
  slot_lists: {},
  schedule_value: 60,
  schedule_unit: "minutes",
  enabled: true,
});

function deriveSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workflow";
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

export default function WorkflowConfigTab({ onExpand }) {
  const [workflows, setWorkflows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [models, setModels] = useState([]);
  const [allImages, setAllImages] = useState([]);
  const [runs, setRuns] = useState([]);
  const [wfImages, setWfImages] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [uploadingStep, setUploadingStep] = useState(null);
  const pollRef = useRef(null);
  const uploadInputRefs = useRef({});

  // Load models + workflows + all images on mount
  useEffect(() => {
    api.listModels().then(setModels).catch(() => {});
    api.listWorkflows().then(setWorkflows).catch(() => {});
    api.getAllImages().then(setAllImages).catch(() => {});
  }, []);

  // Load runs + images when a workflow is selected
  useEffect(() => {
    if (!selectedId) {
      setRuns([]);
      setWfImages([]);
      return;
    }
    api.listWorkflowRuns(selectedId).then(setRuns).catch(() => {});
    api.getWorkflowImages(selectedId).then(setWfImages).catch(() => {});
  }, [selectedId]);

  // Poll active run
  useEffect(() => {
    if (!activeRunId || !selectedId) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const run = await api.getWorkflowRun(selectedId, activeRunId);
        setRuns((prev) => {
          const map = new Map(prev.map((r) => [r.run_id, r]));
          map.set(run.run_id, run);
          return [...map.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
        });
        if (run.status === "done" || run.status === "failed") {
          setActiveRunId(null);
          api.getWorkflowImages(selectedId).then(setWfImages).catch(() => {});
          api.listWorkflowRuns(selectedId).then(setRuns).catch(() => {});
          api.getAllImages().then(setAllImages).catch(() => {});
        }
      } catch (e) {
        // keep polling
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [activeRunId, selectedId]);

  function selectWorkflow(wf) {
    setSelectedId(wf.workflow_id);
    setDraft({
      name: wf.name,
      steps: wf.steps.map(normalizeStep),
      slot_lists: { ...wf.slot_lists },
      schedule_value: wf.schedule_value,
      schedule_unit: wf.schedule_unit,
      enabled: wf.enabled,
    });
    setIsNew(false);
    setError(null);
  }

  function startNew() {
    setSelectedId(null);
    setDraft(DEFAULT_WORKFLOW());
    setIsNew(true);
    setRuns([]);
    setWfImages([]);
    setError(null);
  }

  // ---- Draft mutations ----

  function setDraftField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function updateStep(index, key, value) {
    setDraft((d) => {
      const steps = d.steps.map((s, i) => i === index ? { ...s, [key]: value } : s);
      return { ...d, steps };
    });
  }

  function addStep() {
    setDraft((d) => ({ ...d, steps: [...d.steps, DEFAULT_STEP()] }));
  }

  // Step references are positional, so they have to be remapped when the list changes
  function remapStepRefs(steps, mapIndex) {
    return steps.map((s) => ({
      ...s,
      source_step_index: s.source_step_index == null ? null : mapIndex(s.source_step_index),
      merge_source_steps: (s.merge_source_steps || [])
        .map(mapIndex)
        .filter((i) => i != null),
    }));
  }

  function removeStep(index) {
    setDraft((d) => {
      const steps = remapStepRefs(
        d.steps.filter((_, i) => i !== index),
        (i) => (i === index ? null : i > index ? i - 1 : i)
      );
      return { ...d, steps };
    });
  }

  function moveStep(index, dir) {
    setDraft((d) => {
      const steps = [...d.steps];
      const target = index + dir;
      if (target < 0 || target >= steps.length) return d;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return {
        ...d,
        steps: remapStepRefs(steps, (i) => (i === index ? target : i === target ? index : i)),
      };
    });
  }

  // ---- Slot lists ----

  function addSlot() {
    setDraft((d) => {
      const newKey = `slot${Object.keys(d.slot_lists).length + 1}`;
      return { ...d, slot_lists: { ...d.slot_lists, [newKey]: [] } };
    });
  }

  function renameSlot(oldKey, newKey) {
    setDraft((d) => {
      const entries = Object.entries(d.slot_lists);
      const updated = Object.fromEntries(
        entries.map(([k, v]) => [k === oldKey ? newKey : k, v])
      );
      return { ...d, slot_lists: updated };
    });
  }

  function updateSlotWords(key, text) {
    const words = text.split("\n").map((w) => w.trim()).filter(Boolean);
    setDraft((d) => ({ ...d, slot_lists: { ...d.slot_lists, [key]: words } }));
  }

  function removeSlot(key) {
    setDraft((d) => {
      const { [key]: _, ...rest } = d.slot_lists;
      return { ...d, slot_lists: rest };
    });
  }

  // Find slot placeholders referenced in templates but not defined
  function getMissingSlots() {
    if (!draft) return [];
    const referenced = new Set();
    const regex = /\{([^}]+)\}/g;
    for (const step of draft.steps) {
      let m;
      while ((m = regex.exec(step.prompt_template)) !== null) {
        referenced.add(m[1]);
      }
    }
    // {text} / {stepN_text} are upstream text outputs, not randomization slots
    return [...referenced].filter(
      (s) => !(s in draft.slot_lists) && !/^(?:step\d+_)?text$/.test(s)
    );
  }

  // True when the step at `index` produces text a later prompt can splice in
  function isTextStep(index) {
    const step = draft && draft.steps[index];
    const info = step && models.find((m) => m.id === step.model);
    return !!info && !!info.is_text;
  }

  // Nearest earlier step that produces images, skipping text steps
  function nearestImageStepBefore(index) {
    for (let si = index - 1; si >= 0; si--) {
      if (!isTextStep(si)) return si;
    }
    return null;
  }

  // {text} / {stepN_text} placeholders that no preceding text step can satisfy
  function findBadTextRefs(template, index, textStepIdxs) {
    const bad = [];
    const regex = /\{(?:step(\d+)_)?text\}/g;
    let m;
    while ((m = regex.exec(template || "")) !== null) {
      if (m[1] === undefined) {
        if (textStepIdxs.length === 0) bad.push("{text}");
      } else if (!textStepIdxs.includes(parseInt(m[1], 10) - 1)) {
        bad.push(m[0]);
      }
    }
    return [...new Set(bad)];
  }

  function toggleRefImage(stepIndex, imageId, single) {
    const ids = draft.steps[stepIndex].initial_image_ids || [];
    if (ids.includes(imageId)) {
      updateStep(stepIndex, "initial_image_ids", ids.filter((id) => id !== imageId));
    } else {
      updateStep(stepIndex, "initial_image_ids", single ? [imageId] : [...ids, imageId]);
    }
  }

  // Uploads become ordinary gallery entries, so the step just references the new id
  async function handleStepUpload(stepIndex, files, single) {
    if (!files || files.length === 0) return;
    setUploadingStep(stepIndex);
    setError(null);
    try {
      const selected = Array.from(files).slice(0, single ? 1 : files.length);
      const uploaded = [];
      for (const file of selected) {
        const dataUrl = await scaleViaCanvas(file);
        const img = await api.uploadImage(dataUrl, file.name);
        uploaded.push(img.image_id);
      }
      setAllImages(await api.getAllImages());
      const existing = draft.steps[stepIndex].initial_image_ids || [];
      updateStep(
        stepIndex,
        "initial_image_ids",
        single ? uploaded.slice(-1) : [...existing, ...uploaded]
      );
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setUploadingStep(null);
    }
  }

  // True when the step at `index` produces video output that a merger can consume
  function isVideoStep(index) {
    const step = draft && draft.steps[index];
    const info = step && models.find((m) => m.id === step.model);
    return !!info && info.output_extension === ".mp4";
  }

  function toggleMergeSource(stepIndex, sourceIndex) {
    setDraft((d) => {
      const steps = d.steps.map((s, i) => {
        if (i !== stepIndex) return s;
        const current = s.merge_source_steps || [];
        const next = current.includes(sourceIndex)
          ? current.filter((si) => si !== sourceIndex)
          : [...current, sourceIndex].sort((a, b) => a - b);
        return { ...s, merge_source_steps: next };
      });
      return { ...d, steps };
    });
  }

  // ---- Save ----

  async function handleSave() {
    if (!draft || !draft.name.trim()) {
      setError("Workflow name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        steps: draft.steps.map((s) => ({
          step_id: s.step_id || undefined,
          model: s.model,
          num_outputs: s.num_outputs,
          prompt_template: s.prompt_template,
          aspect_ratio: s.aspect_ratio || "9:16",
          duration: s.duration ?? 5,
          resolution: s.resolution || "2K",
          save_audio: s.save_audio ?? true,
          initial_image_ids: s.initial_image_ids || [],
          source_step_index: s.source_step_index ?? null,
          merge_source_steps: s.merge_source_steps || [],
          language: s.language || "english",
          caption_size: s.caption_size ?? 40,
        })),
        slot_lists: draft.slot_lists,
        schedule_value: draft.schedule_value,
        schedule_unit: draft.schedule_unit,
        enabled: draft.enabled,
      };
      let saved;
      if (isNew) {
        saved = await api.createWorkflow(payload);
      } else {
        saved = await api.updateWorkflow(selectedId, payload);
      }
      const updated = await api.listWorkflows();
      setWorkflows(updated);
      setSelectedId(saved.workflow_id);
      setDraft({
        name: saved.name,
        steps: saved.steps.map(normalizeStep),
        slot_lists: { ...saved.slot_lists },
        schedule_value: saved.schedule_value,
        schedule_unit: saved.schedule_unit,
        enabled: saved.enabled,
      });
      setIsNew(false);
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Trigger ----

  async function handleRunNow() {
    if (!selectedId) return;
    setTriggering(true);
    setError(null);
    try {
      const { run_id } = await api.triggerWorkflow(selectedId);
      setActiveRunId(run_id);
      // optimistically add a placeholder run
      setRuns((prev) => [
        {
          run_id,
          workflow_id: selectedId,
          started_at: new Date().toISOString(),
          finished_at: null,
          status: "running",
          total: draft.steps.reduce((acc, s) => acc + s.num_outputs, 0),
          completed: 0,
          step_results: [],
          resolved_prompts: [],
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e.message || "Trigger failed.");
    } finally {
      setTriggering(false);
    }
  }

  // ---- Duplicate ----

  async function handleDuplicate() {
    if (!selectedId) return;
    setDuplicating(true);
    setError(null);
    try {
      const copy = await api.duplicateWorkflow(selectedId);
      setWorkflows(await api.listWorkflows());
      selectWorkflow(copy);
    } catch (e) {
      setError(e.message || "Duplicate failed.");
    } finally {
      setDuplicating(false);
    }
  }

  // ---- Delete workflow ----

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Delete this workflow? Generated images are kept.")) return;
    try {
      await api.deleteWorkflow(selectedId);
      const updated = await api.listWorkflows();
      setWorkflows(updated);
      setSelectedId(null);
      setDraft(null);
      setRuns([]);
      setWfImages([]);
    } catch (e) {
      setError(e.message || "Delete failed.");
    }
  }

  // ---- Active run progress ----

  const activeRun = runs.find((r) => r.run_id === activeRunId);
  const progressPercent = activeRun && activeRun.total > 0
    ? Math.round((activeRun.completed / activeRun.total) * 100)
    : 0;

  const missingSlots = draft ? getMissingSlots() : [];

  // ---- Render ----

  return (
    <div className="wf-outer">
      {/* Workflow selector bar */}
      <div className="wf-selector-bar">
        {workflows.map((wf) => (
          <button
            key={wf.workflow_id}
            type="button"
            className={`wf-pill${selectedId === wf.workflow_id && !isNew ? " active" : ""}`}
            onClick={() => selectWorkflow(wf)}
          >
            {wf.name}
            {!wf.enabled && <span className="wf-disabled-badge">off</span>}
          </button>
        ))}
        <button
          type="button"
          className={`wf-pill wf-pill-new${isNew ? " active" : ""}`}
          onClick={startNew}
        >
          + New Workflow
        </button>
      </div>

      {/* Editor */}
      {draft && (
        <div className="wf-panel">
          {error && <div className="wf-error">{error}</div>}

          {/* Name + schedule */}
          <div className="wf-row">
            <div className="wf-field wf-field-name">
              <label className="prompt-label">Workflow Name</label>
              <input
                className="klein-input"
                value={draft.name}
                onChange={(e) => setDraftField("name", e.target.value)}
                placeholder="My workflow"
              />
              {draft.name && (
                <span className="wf-slug-hint">slug: {deriveSlug(draft.name)}</span>
              )}
            </div>
            <div className="wf-field">
              <label className="prompt-label">Run every</label>
              <div className="wf-schedule-row">
                <input
                  type="number"
                  className="klein-input wf-num-input"
                  min={1}
                  value={draft.schedule_value}
                  onChange={(e) => setDraftField("schedule_value", parseInt(e.target.value) || 1)}
                />
                <select
                  className="klein-input"
                  value={draft.schedule_unit}
                  onChange={(e) => setDraftField("schedule_unit", e.target.value)}
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <label className="wf-toggle-label">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraftField("enabled", e.target.checked)}
                  />
                  <span>Enabled</span>
                </label>
              </div>
            </div>
          </div>

          {/* Slot lists */}
          <div className="wf-section">
            <div className="wf-section-header">
              <span className="wf-section-title">Randomization Slots</span>
              <button type="button" className="btn btn-secondary wf-btn-sm" onClick={addSlot}>
                + Add Slot
              </button>
            </div>
            {Object.keys(draft.slot_lists).length === 0 && (
              <p className="wf-hint">
                Add slots to randomize parts of your prompts. Use <code>{"{subject}"}</code> in a step prompt and add a "subject" slot with one word or phrase per line.
              </p>
            )}
            <div className="wf-slot-table">
              {Object.entries(draft.slot_lists).map(([key, words]) => (
                <div key={key} className="wf-slot-row">
                  <div className="wf-slot-name-col">
                    <input
                      className="klein-input wf-slot-name-input"
                      value={key}
                      onChange={(e) => renameSlot(key, e.target.value)}
                      placeholder="slot name"
                    />
                    <button
                      type="button"
                      className="btn btn-danger wf-btn-sm"
                      onClick={() => removeSlot(key)}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    className="prompt-textarea wf-slot-textarea"
                    value={words.join("\n")}
                    onChange={(e) => updateSlotWords(key, e.target.value)}
                    placeholder="one word or phrase per line"
                    rows={3}
                  />
                </div>
              ))}
            </div>
            {missingSlots.length > 0 && (
              <div className="wf-warning">
                Undefined slots in prompts: {missingSlots.map((s) => `{${s}}`).join(", ")}
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="wf-section">
            <div className="wf-section-header">
              <span className="wf-section-title">Steps</span>
            </div>
            <div className="wf-step-list">
              {draft.steps.map((step, i) => {
                const modelInfo = models.find((m) => m.id === step.model);
                const isChained = i > 0;
                // Which step provides reference images: the explicit source, else the
                // nearest earlier step that produces images — text steps are skipped,
                // matching how the backend resolves it.
                const defaultSourceIdx = nearestImageStepBefore(i);
                const sourceIdx = (step.source_step_index != null && step.source_step_index < i)
                  ? step.source_step_index
                  : defaultSourceIdx;
                const isMerger = !!(modelInfo && modelInfo.is_merger);
                const isTextModel = !!(modelInfo && modelInfo.is_text);
                const isUpload = !!(modelInfo && modelInfo.is_upload);
                const chainWarning = isChained && modelInfo && !isMerger && !isUpload
                  && !modelInfo.accepts_image && !modelInfo.is_multi_reference;
                const showAspectRatio = modelInfo && modelInfo.supports_aspect_ratio && !isUpload;
                const showDuration = modelInfo && modelInfo.supports_duration;
                const showResolution = modelInfo && modelInfo.supports_resolution;
                const showRefPicker = modelInfo
                  && (modelInfo.is_multi_reference || modelInfo.is_text || modelInfo.is_upload);
                const stepImageCount = (step.initial_image_ids || []).length;
                const showCaptions = modelInfo && modelInfo.supports_captions;
                // Earlier steps this merger can pull clips from, and how many clips that yields
                const videoStepIdxs = isMerger
                  ? draft.steps.slice(0, i).map((_, si) => si).filter(isVideoStep)
                  : [];
                const mergeSources = (step.merge_source_steps || []).filter((si) => si < i);
                const effectiveSources = mergeSources.length ? mergeSources : videoStepIdxs;
                const mergeClipCount = effectiveSources.reduce(
                  (acc, si) => acc + (draft.steps[si]?.num_outputs || 0), 0
                );
                // Text placeholders can only refer to a text step that runs earlier
                const textStepIdxs = draft.steps.slice(0, i).map((_, si) => si).filter(isTextStep);
                const badTextRefs = findBadTextRefs(step.prompt_template, i, textStepIdxs);
                return (
                  <div key={i} className="wf-step-card">
                    <div className="wf-step-header">
                      <span className="wf-step-num">Step {i + 1}</span>
                      <div className="wf-step-actions">
                        <button
                          type="button"
                          className="btn btn-secondary wf-btn-sm"
                          onClick={() => moveStep(i, -1)}
                          disabled={i === 0}
                          title="Move up"
                        >▲</button>
                        <button
                          type="button"
                          className="btn btn-secondary wf-btn-sm"
                          onClick={() => moveStep(i, 1)}
                          disabled={i === draft.steps.length - 1}
                          title="Move down"
                        >▼</button>
                        <button
                          type="button"
                          className="btn btn-danger wf-btn-sm"
                          onClick={() => removeStep(i)}
                          disabled={draft.steps.length === 1}
                          title="Remove step"
                        >✕</button>
                      </div>
                    </div>

                    <div className="wf-step-body">
                      <div className="wf-step-row">
                        <div className="wf-field">
                          <label className="prompt-label">Model</label>
                          <select
                            className="klein-input"
                            value={step.model}
                            onChange={(e) => updateStep(i, "model", e.target.value)}
                          >
                            {models.length === 0
                              ? <option value={step.model}>{step.model}</option>
                              : models.map((m) => (
                                <option key={m.id} value={m.id}>{m.id}</option>
                              ))
                            }
                          </select>
                        </div>
                        {!isMerger && !isUpload && (
                          <div className="wf-field wf-field-outputs">
                            <label className="prompt-label">Outputs</label>
                            <input
                              type="number"
                              className="klein-input wf-num-input"
                              min={1}
                              max={4}
                              value={step.num_outputs}
                              onChange={(e) => updateStep(i, "num_outputs", Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))}
                            />
                          </div>
                        )}
                        {!isMerger && !isUpload && i >= 2 && (
                          <div className="wf-field">
                            <label className="prompt-label">From step</label>
                            <select
                              className="klein-input"
                              value={step.source_step_index ?? defaultSourceIdx ?? ""}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                updateStep(i, "source_step_index", val === defaultSourceIdx ? null : val);
                              }}
                            >
                              {draft.steps.slice(0, i).map((_, si) => si)
                                .filter((si) => !isTextStep(si))
                                .map((si) => (
                                  <option key={si} value={si}>Step {si + 1}</option>
                                ))}
                            </select>
                          </div>
                        )}
                        {showAspectRatio && (
                          <div className="wf-field">
                            <label className="prompt-label">Aspect Ratio</label>
                            <select
                              className="klein-input"
                              value={step.aspect_ratio || "9:16"}
                              onChange={(e) => updateStep(i, "aspect_ratio", e.target.value)}
                            >
                              {["9:16", "1:1", "4:5", "16:9", "3:4", "2:3"].map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {showResolution && (
                          <div className="wf-field">
                            <label className="prompt-label">Resolution</label>
                            <select
                              className="klein-input"
                              value={step.resolution || "2K"}
                              onChange={(e) => updateStep(i, "resolution", e.target.value)}
                            >
                              {["768P", "1080P", "2K"].map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {showDuration && (
                          <div className="wf-field">
                            <label className="prompt-label">Duration: {step.duration ?? 5}s</label>
                            <input
                              type="range"
                              min={1}
                              max={30}
                              value={step.duration ?? 5}
                              onChange={(e) => updateStep(i, "duration", parseInt(e.target.value))}
                              className="wf-duration-slider"
                            />
                          </div>
                        )}
                        {showDuration && (
                          <div className="wf-field wf-field-audio">
                            <label className="wf-toggle-label">
                              <input
                                type="checkbox"
                                checked={step.save_audio ?? true}
                                onChange={(e) => updateStep(i, "save_audio", e.target.checked)}
                              />
                              <span>Save audio</span>
                            </label>
                          </div>
                        )}
                        {showCaptions && (
                          <div className="wf-field">
                            <label className="prompt-label">Caption language</label>
                            <input
                              type="text"
                              className="klein-input"
                              value={step.language || "english"}
                              onChange={(e) => updateStep(i, "language", e.target.value)}
                              placeholder="english, french, auto…"
                            />
                          </div>
                        )}
                        {showCaptions && (
                          <div className="wf-field">
                            <label className="prompt-label">Caption size: {step.caption_size ?? 40}</label>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={5}
                              value={step.caption_size ?? 40}
                              onChange={(e) => updateStep(i, "caption_size", parseInt(e.target.value))}
                              className="wf-duration-slider"
                            />
                          </div>
                        )}
                      </div>

                      {chainWarning && sourceIdx != null && (
                        <div className="wf-warning">
                          This model does not accept image input — Step {sourceIdx + 1}'s output will not be passed as reference.
                        </div>
                      )}

                      {showRefPicker && (
                        <div className="wf-ref-picker">
                          <div className="wf-ref-picker-header">
                            <label className="prompt-label">
                              {isUpload ? "Images" : isTextModel ? "Reference Image" : "Reference Images"}
                              {isUpload && (
                                <span className="wf-ref-hint"> — later steps can use these with "From step → Step {i + 1}"</span>
                              )}
                              {!isUpload && isChained && sourceIdx != null && (
                                <span className="wf-ref-hint"> — Step {sourceIdx + 1}'s output will be used; select below as fallback for Step 1</span>
                              )}
                            </label>
                            <div className="wf-ref-picker-actions">
                              <button
                                type="button"
                                className="btn btn-secondary wf-btn-sm"
                                onClick={() => uploadInputRefs.current[i]?.click()}
                                disabled={uploadingStep === i}
                                title="Upload an image from your computer"
                              >
                                {uploadingStep === i ? "Uploading…" : "↑ Upload"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary wf-btn-sm"
                                onClick={() => api.getAllImages().then(setAllImages).catch(() => {})}
                                title="Refresh image list"
                              >↻</button>
                            </div>
                          </div>
                          <input
                            ref={(el) => { uploadInputRefs.current[i] = el; }}
                            type="file"
                            accept="image/*"
                            multiple={!isTextModel}
                            style={{ display: "none" }}
                            onChange={(e) => { handleStepUpload(i, e.target.files, isTextModel); e.target.value = ""; }}
                          />
                          {(() => {
                            const refImages = allImages.filter(isPickableImage).reverse();
                            return refImages.length === 0 ? (
                              <p className="wf-hint">
                                No images yet. Upload one above, or run a generation first.
                              </p>
                            ) : (
                              <div className="wf-ref-grid">
                                {refImages.map((img) => {
                                  const selected = (step.initial_image_ids || []).includes(img.image_id);
                                  return (
                                    <div
                                      key={img.image_id}
                                      className={`wf-ref-thumb${selected ? " selected" : ""}`}
                                      onClick={() => toggleRefImage(i, img.image_id, isTextModel)}
                                    >
                                      <img src={img.url} alt="" />
                                      {selected && <span className="wf-ref-check">✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {isTextModel && (
                            <p className="wf-hint">gpt-5-nano takes a single image — picking another replaces it.</p>
                          )}
                          {isUpload && stepImageCount === 0 && (
                            <div className="wf-warning">
                              No image selected — this step will fail the run. Upload one or pick from above.
                            </div>
                          )}
                        </div>
                      )}

                      {isMerger && (
                        <div className="wf-merge-picker">
                          <label className="prompt-label">Merge videos from</label>
                          {videoStepIdxs.length === 0 ? (
                            <p className="wf-hint">
                              No earlier step produces video. Add a video step (e.g. p-video) before this one.
                            </p>
                          ) : (
                            <>
                              <div className="wf-merge-options">
                                {videoStepIdxs.map((si) => (
                                  <label key={si} className="wf-merge-option">
                                    <input
                                      type="checkbox"
                                      checked={mergeSources.includes(si)}
                                      onChange={() => toggleMergeSource(i, si)}
                                    />
                                    <span>
                                      Step {si + 1}
                                      <span className="wf-merge-option-meta">
                                        {" "}· {draft.steps[si].model} · {draft.steps[si].num_outputs} clip
                                        {draft.steps[si].num_outputs !== 1 ? "s" : ""}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <p className="wf-hint">
                                Clips are joined in step order, then in the order they were generated.
                                {mergeSources.length === 0 && " Nothing checked — every earlier video step is used."}
                              </p>
                            </>
                          )}
                          {videoStepIdxs.length > 0 && mergeClipCount < 2 && (
                            <div className="wf-warning">
                              Only {mergeClipCount} video would be available — merging needs at least 2.
                              Raise the source step's Outputs or check another step.
                            </div>
                          )}
                        </div>
                      )}

                      {!isMerger && !isUpload && (
                        <>
                          <label className="prompt-label">Prompt template</label>
                          <textarea
                            className="prompt-textarea"
                            value={step.prompt_template}
                            onChange={(e) => updateStep(i, "prompt_template", e.target.value)}
                            placeholder='e.g. "A {subject} in {scene} wearing {outfit}"'
                            rows={3}
                          />
                          {textStepIdxs.length > 0 && (
                            <p className="wf-hint">
                              Text placeholders: <code>{"{text}"}</code> uses Step{" "}
                              {textStepIdxs[textStepIdxs.length - 1] + 1}'s output
                              {textStepIdxs.length > 1 && (
                                <> · target one directly with{" "}
                                  {textStepIdxs.map((si) => `{step${si + 1}_text}`).join(", ")}</>
                              )}
                            </p>
                          )}
                          {badTextRefs.length > 0 && (
                            <div className="wf-warning">
                              {badTextRefs.join(", ")} in this prompt {badTextRefs.length === 1 ? "does" : "do"} not
                              match a text step before this one.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn btn-secondary wf-add-step-btn" onClick={addStep}>
              + Add Step
            </button>
          </div>

          {/* Actions */}
          <div className="wf-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!isNew && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDuplicate}
                  disabled={duplicating}
                  title="Create a disabled copy of this workflow"
                >
                  {duplicating ? "Duplicating…" : "Duplicate"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRunNow}
                  disabled={triggering || !!activeRunId}
                >
                  {triggering ? "Starting…" : activeRunId ? "Running…" : "Run Now"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger wf-btn-delete"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </>
            )}
          </div>

          {/* Progress bar */}
          {activeRun && (
            <div className="progress-panel">
              <div className="progress-header">
                <span className="progress-text">
                  {activeRun.status === "done"
                    ? `Done — ${activeRun.total} image${activeRun.total !== 1 ? "s" : ""} generated`
                    : activeRun.status === "failed"
                    ? "Run failed"
                    : `Running… ${activeRun.completed}/${activeRun.total}`}
                </span>
                <span className="progress-percent">{progressPercent}%</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <div className="wf-section wf-run-section">
          <div className="wf-section-header">
            <span className="wf-section-title">Run History</span>
          </div>
          <div className="wf-run-list">
            {runs.map((run) => (
              <div key={run.run_id} className="wf-run-item">
                <div
                  className="wf-run-summary"
                  onClick={() => setExpandedRunId(expandedRunId === run.run_id ? null : run.run_id)}
                >
                  <span className={`wf-run-badge ${run.status}`}>{run.status}</span>
                  <span className="wf-run-time">{formatDate(run.started_at)}</span>
                  <span className="wf-run-prog">{run.completed}/{run.total} images</span>
                  <span className="wf-run-toggle">{expandedRunId === run.run_id ? "▲" : "▼"}</span>
                </div>
                {expandedRunId === run.run_id && (
                  <div className="wf-run-detail">
                    {run.step_results.map((sr, si) => (
                      <div key={sr.step_id} className="wf-run-step">
                        <span className={`wf-run-badge ${sr.status}`}>{sr.status}</span>
                        <span className="wf-run-step-label">Step {si + 1}</span>
                        {run.resolved_prompts[si] && (
                          <span className="wf-run-prompt">"{run.resolved_prompts[si]}"</span>
                        )}
                        {sr.error && <span className="wf-run-error">{sr.error}</span>}
                        <div className="wf-run-thumbs">
                          {sr.image_urls.map((url, k) => (
                            isTextFile(url) ? (
                              <a key={k} href={url} target="_blank" rel="noreferrer" className="wf-thumb wf-thumb-text">
                                TXT
                              </a>
                            ) : isVideoFile(url) ? (
                              <video key={k} src={url} className="wf-thumb" muted playsInline preload="metadata" controls />
                            ) : (
                              <img key={k} src={url} alt="" className="wf-thumb" />
                            )
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gallery */}
      {wfImages.length > 0 && (
        <div className="wf-gallery-section">
          <div className="wf-section-header">
            <span className="wf-section-title">Generated Images</span>
          </div>
          <ImageGrid
            images={wfImages}
            onSelect={() => {}}
            onDelete={async (imageId) => {
              try {
                await api.deleteWorkflowImage(selectedId, imageId);
                setWfImages((prev) => prev.filter((img) => img.image_id !== imageId));
              } catch (e) {
                setError(e.message || "Delete failed.");
              }
            }}
            onExpand={onExpand}
          />
        </div>
      )}
    </div>
  );
}
