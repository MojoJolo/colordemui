async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// Load all images across all past jobs (called on mount)
export async function getAllImages() {
  return handleResponse(await fetch("/images"));
}

// Start a new generation job
// model: "recraft-v3-svg" | "flux-2-pro" | "flux-2-klein-9b"
// imageData: array of base64 data URIs (required for img2img models)
// options: { seed?: number, numOutputs?: number }
export async function createJob(prompts, model = "recraft-v3-svg", imageData = null, options = {}) {
  const {
    seed = null, numOutputs = 1, selectedImageId = null, duration = 5,
    aspectRatio = "9:16", selectedLastFrameImageId = null, saveAudio = true,
    firstFrameData = null, lastFrameData = null,
    loraWeights = null, loraScale = 0.5, hfApiToken = null, promptUpsampling = false,
  } = options;
  return handleResponse(
    await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompts,
        model,
        image_data: imageData,
        seed,
        num_outputs: numOutputs,
        selected_image_id: selectedImageId,
        duration,
        aspect_ratio: aspectRatio,
        selected_last_frame_image_id: selectedLastFrameImageId,
        save_audio: saveAudio,
        first_frame_data: firstFrameData,
        last_frame_data: lastFrameData,
        lora_weights: loraWeights,
        lora_scale: loraScale,
        hf_api_token: hfApiToken,
        prompt_upsampling: promptUpsampling,
      }),
    })
  );
}

// Poll a specific job for progress
export async function getJob(jobId) {
  return handleResponse(await fetch(`/jobs/${jobId}`));
}

// Per-image mutations — no job_id needed
export async function selectImage(imageId, selected) {
  return handleResponse(
    await fetch(`/images/${imageId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected }),
    })
  );
}

export async function deleteImage(imageId) {
  return handleResponse(
    await fetch(`/images/${imageId}`, { method: "DELETE" })
  );
}

// Batch operations
export async function selectAll() {
  return handleResponse(await fetch("/images/select-all", { method: "POST" }));
}

export async function unselectAll() {
  return handleResponse(await fetch("/images/unselect-all", { method: "POST" }));
}

export async function deleteSelected() {
  return handleResponse(await fetch("/images/selected", { method: "DELETE" }));
}

export function getPdfUrl() {
  return "/images/pdf";
}

export function getLoraZipUrl(triggerWord = "") {
  const params = triggerWord.trim()
    ? `?trigger_word=${encodeURIComponent(triggerWord.trim())}`
    : "";
  return `/images/lora-zip${params}`;
}
