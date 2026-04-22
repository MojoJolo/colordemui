import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import ImageGrid from "./ImageGrid";

const DEFAULT_STEP = () => ({
  step_id: null,
  model: "recraft-v3-svg",
  num_outputs: 1,
  prompt_template: "",
  aspect_ratio: "9:16",
  duration: 5,
  save_audio: true,
  initial_image_ids: [],
});

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
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const pollRef = useRef(null);

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
      steps: wf.steps.map((s) => ({
        ...s,
        aspect_ratio: s.aspect_ratio || "9:16",
        duration: s.duration ?? 5,
        save_audio: s.save_audio ?? true,
        initial_image_ids: s.initial_image_ids || [],
      })),
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

  function removeStep(index) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  }

  function moveStep(index, dir) {
    setDraft((d) => {
      const steps = [...d.steps];
      const target = index + dir;
      if (target < 0 || target >= steps.length) return d;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...d, steps };
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
    return [...referenced].filter((s) => !(s in draft.slot_lists));
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
          save_audio: s.save_audio ?? true,
          initial_image_ids: s.initial_image_ids || [],
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
        steps: saved.steps.map((s) => ({
          ...s,
          aspect_ratio: s.aspect_ratio || "9:16",
          initial_image_ids: s.initial_image_ids || [],
        })),
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
                Add slots to randomize parts of your prompts. Use <code>{"{subject}"}</code> in a step prompt and add a "subject" slot with words.
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
                    placeholder="one word per line"
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
                const chainWarning = isChained && modelInfo && !modelInfo.accepts_image && !modelInfo.is_multi_reference;
                const showAspectRatio = modelInfo && modelInfo.supports_aspect_ratio;
                const showDuration = modelInfo && modelInfo.supports_duration;
                const showRefPicker = modelInfo && modelInfo.is_multi_reference;
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
                      </div>

                      {chainWarning && (
                        <div className="wf-warning">
                          This model does not accept image input — previous step's output will not be passed as reference.
                        </div>
                      )}

                      {showRefPicker && (
                        <div className="wf-ref-picker">
                          <label className="prompt-label">
                            Reference Images
                            {isChained && (
                              <span className="wf-ref-hint"> — previous step's output will be used; select below as fallback for Step 1</span>
                            )}
                          </label>
                          {(() => {
                            const refImages = allImages
                              .filter((img) => img.filename && img.status === "done"
                                && !img.filename.endsWith(".mp4")
                                && !img.filename.endsWith(".svg"))
                              .slice(-40)
                              .reverse();
                            return refImages.length === 0 ? (
                              <p className="wf-hint">No generated images yet. Run some generations first.</p>
                            ) : (
                              <div className="wf-ref-grid">
                                {refImages.map((img) => {
                                  const selected = (step.initial_image_ids || []).includes(img.image_id);
                                  return (
                                    <div
                                      key={img.image_id}
                                      className={`wf-ref-thumb${selected ? " selected" : ""}`}
                                      onClick={() => {
                                        const ids = step.initial_image_ids || [];
                                        updateStep(i, "initial_image_ids", selected
                                          ? ids.filter((id) => id !== img.image_id)
                                          : [...ids, img.image_id]
                                        );
                                      }}
                                    >
                                      <img src={img.url} alt="" />
                                      {selected && <span className="wf-ref-check">✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <label className="prompt-label">Prompt template</label>
                      <textarea
                        className="prompt-textarea"
                        value={step.prompt_template}
                        onChange={(e) => updateStep(i, "prompt_template", e.target.value)}
                        placeholder='e.g. "A {subject} in {scene} wearing {outfit}"'
                        rows={3}
                      />
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
            {runs.slice(0, 10).map((run) => (
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
                            <img key={k} src={url} alt="" className="wf-thumb" />
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
