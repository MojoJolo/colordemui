# Product Feature Inventory

**Product:** Coloring Book Generator (internal name: `colordemui`)
**Last updated:** 2026-07-31
**Audience:** Product Management

A self-hosted web app for generating images and videos through [Replicate](https://replicate.com)
models. It started as a coloring-book page generator and has grown into a
multi-model creative studio with a shared media library, export tooling, and
scheduled multi-step generation workflows.

---

## 1. Product at a glance

| Area | What it does |
|------|--------------|
| **Generation studio** | 10 AI models exposed as dedicated, purpose-built tabs (text→image, image→image, image editing, text/image→video, video captioning) |
| **Media library** | One shared gallery of every asset ever generated, persisted across sessions |
| **Export** | Print-ready PDF coloring books and LoRA training datasets (ZIP) |
| **Workflows** | Multi-step generation pipelines with prompt randomization and recurring schedules |
| **Access control** | Username/password sign-in with bearer-token sessions |
| **Deployment** | Local dev servers or one-command Docker Compose |

---

## 2. Generation models (10)

Each model has its own tab in the UI with controls tailored to what that model
supports. All jobs run in the background so the user can keep working while
images are produced, and the gallery fills in progressively as each output finishes.

| # | Tab | Model | Type | Key controls |
|---|-----|-------|------|--------------|
| 1 | Coloring Book | `recraft-ai/recraft-v3-svg` | Text → SVG line art | Batch prompts (one per line) |
| 2 | Coloring Book | `black-forest-labs/flux-2-pro` | Photo → coloring page | Photo upload (multiple) |
| 3 | Flux Klein 9B | `black-forest-labs/flux-2-klein-9b` | Multi-reference → image | Up to N reference images, seed, output count, 6 aspect ratios |
| 4 | Z Image Turbo | `prunaai/z-image-turbo` | Text → image | 6 aspect ratios, multi-prompt batching |
| 5 | P-Image LoRA | `prunaai/p-image-lora` | Text → image with LoRA | LoRA weights URL, LoRA scale, HF API token, seed, prompt upsampling, 7 aspect ratios |
| 6 | P-Image Edit | `prunaai/p-image-edit` | Image editing | Edit target + up to 4 references, 18 edit presets, 8 aspect ratios, seed |
| 7 | Nano Banana 2 | `google/nano-banana-2` (Gemini 3.1 Flash Image) | Text → image, optional image guidance | Up to 5 reference images, 7 aspect ratios, seed, output count |
| 8 | P-Video | `prunaai/p-video` | Image → video | First frame + last frame, duration 1–30 s, 7 aspect ratios, save-audio toggle |
| 9 | Grok Video | `xai/grok-imagine-video` | Text → video (optional image/video input) | Duration 1–8 s, 5 aspect ratios, image *or* video seed input |
| 10 | TikTok Captions | `shreejalmaharjan-27/tiktok-short-captions` | Video → captioned video | Video upload, language, caption size, optional transcription hint |

### 2.1 Coloring-book specialization

- A curated, hard-coded style prompt and negative prompt enforce the coloring-book
  look: thick uniform outlines, open shapes, pure black-and-white, no shading or
  gradients — tuned for printable, easy-to-color pages.
- Generated raster pages are post-processed to whiten off-white backgrounds so
  prints come out clean.

### 2.2 Shared generation capabilities

- **Batch prompting** — one prompt per line (coloring book) or `=====`-separated
  blocks (Flux Klein, Z Turbo, P-Image LoRA) to queue many generations at once.
- **Multiple outputs per prompt** — request N variations; seeds auto-increment
  per output for reproducible-but-varied results.
- **Seed control** — set a seed for reproducibility or leave blank for random.
- **Aspect-ratio picker** — visual buttons labelled by use case (TikTok/Reels,
  Square, Portrait, Wide, Classic, Story, Photo).
- **Reference images from two sources** — upload files or click any image already
  in the gallery to reuse it as a reference/source frame.
- **HEIC/HEIF support** — iPhone photos are accepted and converted automatically.
- **Automatic image normalization** — uploads are converted to PNG and downscaled
  to 1 MP in the browser and again server-side to keep uploads fast and API calls valid.
- **Rate limiting** — a global 5-second minimum spacing between Replicate calls
  protects against provider rate limits.
- **Live progress** — per-job progress bar and per-image status (pending, generating,
  done, failed) polled every 1.5 s; failures surface the provider error message
  on the card instead of silently disappearing.

---

## 3. Media library (gallery)

- **Persistent, cross-session** — every image and video ever generated is listed,
  newest first, and survives page refreshes and restarts.
- **Unified across models** — one gallery for all 10 models; each asset records
  its prompt and originating model.
- **Video-aware** — MP4 outputs render as inline video players with hover preview,
  a download button, and lightbox playback (autoplay + loop).
- **Lightbox viewer** — click any asset to expand full-screen; Escape or click-away
  to close.
- **Copy prompt** — one-click copy of the prompt behind any asset.
- **Selection model** — per-asset checkbox plus Select All / Unselect All.
- **Deletion** — delete a single asset or all selected assets; files are removed
  from disk, not just hidden.

---

## 4. Export

### 4.1 PDF coloring book
- Exports all selected images as a US-Letter portrait PDF, one image per page,
  centred with 1-inch margins.
- Handles both SVG (vector, rendered at 2× for print quality) and raster formats.
- Applies background whitening so pages print clean.
- Videos are automatically excluded.

### 4.2 LoRA training dataset (ZIP)
- Exports selected raster images as a training-ready ZIP: sequentially numbered
  image files each paired with a `.txt` caption file containing the prompt.
- Optional **trigger word** prepended to every caption — the standard convention
  for LoRA fine-tuning.
- SVGs and videos are automatically excluded.

---

## 5. Workflows (multi-step automation)

The Workflows tab turns one-off generations into repeatable pipelines.

- **Multi-step pipelines** — chain any number of steps, each with its own model,
  prompt template, output count, aspect ratio, duration, and audio setting.
- **Step chaining** — a step's output is automatically fed as the reference input
  to the next step (e.g. text→image, then image→video, then video→captions).
- **Explicit source selection** — any step can instead pull from a specific earlier
  step rather than the immediately preceding one.
- **Seed images** — the first step can be primed with images picked from the gallery.
- **Prompt randomization slots** — define named word lists (e.g. `{subject}`,
  `{scene}`, `{outfit}`) and reference them in prompt templates; one value per slot
  is picked per run and shared across all steps so the whole run stays coherent.
- **Slot validation** — the UI flags placeholders used in prompts but not defined.
- **Recurring schedule** — run every N minutes, hours, or days; schedules survive
  restarts and can be enabled/disabled per workflow.
- **Run Now** — trigger a workflow on demand outside its schedule.
- **Live run progress** — progress bar with completed/total counts while running.
- **Run history** — every run is recorded with status, timestamp, per-step status,
  the exact resolved prompts used, per-step thumbnails, and error messages.
- **Per-workflow gallery** — all assets a workflow has produced, with per-asset delete.
- **Compatibility warnings** — the editor warns when a step's model can't accept
  the previous step's output as an image input.
- **Full CRUD** — create, rename, edit, reorder steps, duplicate-safe slugs, delete.

---

## 6. Access control

- Username/password sign-in page; credentials configured via environment variables.
- Bearer-token sessions stored in the browser; all API routes protected except
  health check, login, and static asset serving.
- Sign-out button; expired/invalid tokens automatically return the user to the
  login screen.
- Token-in-query-string support so PDF and ZIP downloads work in a new browser tab.

---

## 7. Platform & operations

- **Backend:** Python / FastAPI, background job runner, APScheduler for workflow schedules.
- **Frontend:** React 18 + Vite single-page app.
- **Storage:** file-system based — generated assets on disk, job/workflow metadata
  as JSON. No database to operate.
- **Deployment:** run the two dev servers directly, or `docker compose up --build`
  for the full stack with live reload.
- **API:** ~25 documented REST endpoints covering auth, model discovery, jobs,
  image management, exports, and workflows.
- **Configuration:** Replicate API token plus auth credentials via environment variables.
- **Extensibility:** models are plug-in classes declaring their own capabilities
  (accepts image, requires image, multi-reference, aspect ratio, duration, LoRA,
  edit presets, captions) — adding a model is a single registry entry, and the
  workflow editor picks it up automatically.

---

## 8. Known gaps / notes for roadmap discussion

- Single shared login (one username/password) — no per-user accounts, no roles,
  and no per-user separation of the gallery.
- Sessions are held in memory, so a backend restart signs everyone out.
- Generation is serialized to one Replicate call at a time (plus a 5 s spacing),
  which caps throughput for large batches.
- The gallery loads every asset at once with no pagination, search, or filtering
  by model/date — this will degrade as the library grows.
- Workflow assets live in a separate gallery from the main library and can't be
  selected for PDF/LoRA export.
- No cost tracking or per-model usage reporting for Replicate spend.
- The repository README documents only the original coloring-book flow and predates
  most of the models, workflows, and auth features listed above.
