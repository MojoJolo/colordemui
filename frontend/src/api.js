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
// model: "recraft-v3-svg" | "flux-dev"
// imageData: base64 data URI (required for flux-dev)
export async function createJob(prompts, model = "recraft-v3-svg", imageData = null) {
  return handleResponse(
    await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompts, model, image_data: imageData }),
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
