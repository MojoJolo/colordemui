function getToken() {
  return localStorage.getItem("auth_token");
}

export function setToken(token) {
  localStorage.setItem("auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra;
}

async function handleResponse(res) {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(username, password) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error("Invalid username or password");
  }
  const data = await res.json();
  setToken(data.token);
  return data.token;
}

export async function logout() {
  const token = getToken();
  if (token) {
    await fetch("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearToken();
}

// Load all images across all past jobs (called on mount)
export async function getAllImages() {
  return handleResponse(await fetch("/images", { headers: authHeaders() }));
}

// Start a new generation job
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
      headers: authHeaders({ "Content-Type": "application/json" }),
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
  return handleResponse(await fetch(`/jobs/${jobId}`, { headers: authHeaders() }));
}

// Per-image mutations
export async function selectImage(imageId, selected) {
  return handleResponse(
    await fetch(`/images/${imageId}/select`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ selected }),
    })
  );
}

export async function deleteImage(imageId) {
  return handleResponse(
    await fetch(`/images/${imageId}`, { method: "DELETE", headers: authHeaders() })
  );
}

// Batch operations
export async function selectAll() {
  return handleResponse(await fetch("/images/select-all", { method: "POST", headers: authHeaders() }));
}

export async function unselectAll() {
  return handleResponse(await fetch("/images/unselect-all", { method: "POST", headers: authHeaders() }));
}

export async function deleteSelected() {
  return handleResponse(await fetch("/images/selected", { method: "DELETE", headers: authHeaders() }));
}

export function getPdfUrl() {
  const token = getToken();
  return token ? `/images/pdf?token=${encodeURIComponent(token)}` : "/images/pdf";
}

export function getLoraZipUrl(triggerWord = "") {
  const token = getToken();
  const params = new URLSearchParams();
  if (triggerWord.trim()) params.set("trigger_word", triggerWord.trim());
  if (token) params.set("token", token);
  const qs = params.toString();
  return `/images/lora-zip${qs ? `?${qs}` : ""}`;
}
