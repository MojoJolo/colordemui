# Product Overview — Feature Inventory

**Audience:** incoming Product Manager
**Repo:** `MojoJolo/colordemui`
**Status of this doc:** written from a full read of the codebase at commit `19c84f0` (Apr 2026). Everything below is verified against source; file references are given so you can check any claim yourself.

Companion doc: [`MONETIZATION.md`](./MONETIZATION.md) — strategy, pricing, and the gap list.

---

## 1. What this product is today

A **self-hosted, single-user web app that wraps Replicate's AI model catalog in an opinionated production UI.** The repo name and README say "Coloring Book Generator," but that describes roughly 20% of what has actually been built. Read the commit history and the product tells a different story: it started as a coloring-book page generator and has grown into a **short-form content production line**.

Three distinct capability clusters exist in the code:

| Cluster | What it does | Maturity |
|---|---|---|
| **A. Coloring book publishing** | Text or photo → black-and-white line art → print-ready US-Letter PDF | Complete, shippable |
| **B. Short-form video factory** | Text → image → video → burned-in TikTok captions, on a schedule | Complete, the newest and most-invested area |
| **C. AI asset toolkit** | Multi-reference image gen, 18-preset image editing, LoRA training-set export | Complete |

The **Workflows** feature (Mar–Apr 2026, the most recent major work) is what ties B together and is the single most commercially interesting thing in the repo. It is an unattended, scheduled, multi-step AI pipeline runner. That is a product in its own right.

### Who it serves right now
One operator — the repo owner — running it locally or via Docker Compose, using their own Replicate API token. There is no notion of a second user anywhere in the code.

---

## 2. Architecture in one page

```
┌──────────────────────────────┐         ┌────────────────────────────┐
│  React 18 + Vite SPA         │  HTTP   │  FastAPI (Python 3.10+)    │
│  frontend/  (~3,000 LOC)     │◄───────►│  backend/   (~1,600 LOC)   │
│  - 10 tabs, one per model    │  Bearer │  - AuthMiddleware          │
│  - 1.5s polling for progress │  token  │  - Model registry          │
│  - localStorage token        │         │  - APScheduler (workflows) │
└──────────────────────────────┘         └─────────────┬──────────────┘
                                                       │
                                    ┌──────────────────┴──────────────────┐
                                    │                                     │
                            ┌───────▼────────┐                  ┌─────────▼────────┐
                            │ Local filesystem│                  │  Replicate API   │
                            │ generated/*.png │                  │  10 models       │
                            │ jobs/*.json     │                  │  5s global throttle│
                            │ workflows/*.json│                  └──────────────────┘
                            └─────────────────┘
```

**Key architectural facts a PM must internalise:**

- **No database.** All state is JSON files on local disk (`backend/app/services/storage.py`, `workflow_storage.py`). Every list operation reads and parses *every* job file.
- **No multi-tenancy.** One username/password pair from env vars, defaulting to `admin`/`admin` (`main.py:29-30`). Tokens live in a Python `set` in memory and are wiped on restart (`main.py:31`).
- **One generation at a time, globally.** A `ThreadPoolExecutor(max_workers=1)` (`jobs.py:18`) plus a 5-second global lock between every Replicate call (`models/base.py:9-19`). Throughput ceiling is roughly 12 generations/minute for the entire deployment, and video generations block everything behind them for minutes.
- **Costs are pass-through and unmetered.** Every generation bills the operator's Replicate account. Nothing in the code records, estimates, or caps spend.

**Stack:** FastAPI, Pydantic, Replicate SDK, APScheduler, Pillow/pillow-heif, ReportLab, CairoSVG · React 18, Vite, plain CSS (no UI framework), `heic2any`.

---

## 3. Feature inventory

### 3.1 The ten model tabs

Each tab in the UI is a purpose-built form for one Replicate model. Adding a model requires one class + one registry line (`services/models/__init__.py:18-29`) plus a React form — the extension pattern is clean and is a genuine asset.

| # | Tab | Replicate model | Input → Output | Notable controls |
|---|---|---|---|---|
| 1 | **Coloring Book** | `recraft-ai/recraft-v3-svg` | Text → SVG | Batch: one prompt per line. Heavily engineered style + negative prompt (`base.py:24-58`) enforcing pure-black-on-white, thick strokes, senior-friendly simplicity |
| 2 | **Coloring Book** (2nd model) | `black-forest-labs/flux-2-pro` | Photo → PNG | Photo-to-coloring-page. Post-processes with `whiten_background()` to kill off-white tint (`utils.py:26`) |
| 3 | **Flux Klein 9B** | `black-forest-labs/flux-2-klein-9b` | Text + up to N refs → PNG | Multi-reference. Up to 4 outputs, seed control (auto-increments per output), 8 aspect ratios |
| 4 | **Z Image Turbo** | `prunaai/z-image-turbo` | Text → PNG | Fast/cheap generator. 6 aspect ratios mapped to explicit pixel dims (`z_image_turbo.py:8-15`) |
| 5 | **P-Video** | `prunaai/p-video` | Image → MP4 | **First-frame + last-frame** control, 1–30s duration, audio on/off, safety filter disabled |
| 6 | **P-Image LoRA** | `prunaai/p-image-lora` | Text → PNG | Custom LoRA weights URL, LoRA scale, optional HuggingFace token, prompt upsampling |
| 7 | **P-Image Edit** | `prunaai/p-image-edit` | 1–5 images + prompt → PNG | **18 named edit presets**: relight, to_anime, to_3dchibi, upscale, style/subject/scene consistency, add_characters, next_scene, extract/apply_texture, etc. (`PImageEditForm.jsx:14-33`) |
| 8 | **Grok Video** | `xai/grok-imagine-video` | Text (or image/video) → MP4 | Up to 8s. Accepts video input too. Uses base64 inline encoding to work around Grok rejecting Replicate file URLs (`grok_video.py:78-82`) |
| 9 | **Nano Banana 2** | `google/nano-banana-2` (Gemini 3.1 Flash Image) | Text + 0–5 refs → PNG | Refs optional, so it doubles as pure text-to-image |
| 10 | **TikTok Captions** | `shreejalmaharjan-27/tiktok-short-captions` | MP4 → MP4 | Burns TikTok-style captions in. Language + caption size + initial-prompt hint |

### 3.2 Workflows — the scheduled pipeline engine

**Files:** `services/workflows.py`, `services/scheduler.py`, `components/WorkflowConfigTab.jsx` (772 LOC, the largest component in the repo)

This is the strategic feature. A workflow is a **named, saved, multi-step pipeline that runs on a timer with no human present.**

- **Chained steps.** Each step picks any of the 10 models. By default a step consumes the previous step's output as its image input. `source_step_index` lets a step pull from *any* earlier step, which makes the graph a tree, not just a line (`workflows.py:169-173`).
- **Seed images.** Step 1 can be pinned to specific images already in the gallery (`initial_image_ids`).
- **Prompt slots — randomised templating.** Define named lists (e.g. a `subject` slot with one word or phrase per line), write `{subject}` in a step's prompt template, and each run picks a random value. Critically, **one value is chosen per run and shared across every step** (`workflows.py:154`), so a 4-step image→video→caption chain stays thematically coherent. This is what turns the workflow from a batch tool into a *content variety engine*.
- **Scheduling.** APScheduler interval trigger, configurable in minutes / hours / days, per workflow, with an enable/disable toggle. Schedules are rebuilt from disk on boot (`scheduler.py:12-17`).
- **Manual trigger** available alongside the schedule.
- **Run history.** Every run is persisted with per-step status, resolved prompts, output filenames, and errors. The UI polls and shows live progress plus a browsable per-workflow gallery.

**The user story this enables:** "Every 6 hours, pick a random topic from my list, generate a vertical image, animate it to a 5-second video, burn in captions, and drop it in my folder." That is a faceless-content channel on autopilot.

### 3.3 Asset management and export

- **Global gallery** — every image and video ever generated, across all jobs, newest first, persisted across restarts (`GET /images`).
- **Selection model** — per-asset checkbox, select-all / unselect-all / delete-selected, persisted server-side.
- **PDF export** — selected images → US-Letter portrait, one per page, centred, 1-inch margins. SVGs rasterised at 2× via CairoSVG; rasters run through `whiten_background()` first. Videos auto-excluded (`jobs.py:460-475`, `pdf.py`).
- **LoRA dataset export** — selected raster images → ZIP as `00001.png` + `00001.txt` caption pairs, with an optional trigger word prepended to every caption (`jobs.py:431-457`). This is a training-set builder in the standard LoRA format, and it closes a loop with the P-Image LoRA tab: generate → curate → export → train → generate with your own LoRA.
- **Lightbox** viewer with inline video playback and download.
- **Input handling** — HEIC/HEIF support (iPhone photos) on both ends, browser-side canvas downscaling to 1 MP, server-side Pillow normalisation as a backstop.

### 3.4 Platform / infrastructure

- Token auth with a login page; 401 anywhere in the SPA triggers an automatic logout event.
- Docker Compose for the whole stack, with live reload on both services.
- Health endpoint, model-capability discovery endpoint (`GET /models`) that the frontend uses to render model-appropriate controls.
- Global 5-second inter-call delay to stay inside Replicate rate limits.

---

## 4. Complete API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Username/password → bearer token |
| `POST` | `/auth/logout` | Invalidate token |
| `GET` | `/health` | Health check (public) |
| `GET` | `/models` | Model registry + capability flags |
| `GET` | `/images` | All images, all jobs |
| `POST` | `/jobs` | Create generation job (any model) |
| `GET` | `/jobs/{job_id}` | Poll job progress |
| `POST` | `/images/select-all` · `/images/unselect-all` | Bulk selection |
| `POST` | `/images/{image_id}/select` | Toggle one |
| `DELETE` | `/images/{image_id}` · `/images/selected` | Delete |
| `GET` | `/images/pdf` | PDF of selected |
| `GET` | `/images/lora-zip?trigger_word=` | LoRA dataset ZIP of selected |
| `GET`/`POST` | `/workflows` | List / create |
| `GET`/`PUT`/`DELETE` | `/workflows/{id}` | Read / update / delete |
| `POST` | `/workflows/{id}/trigger` | Run now |
| `GET` | `/workflows/{id}/runs` · `/runs/{run_id}` | Run history |
| `GET`/`DELETE` | `/workflows/{id}/images[/{image_id}]` | Per-workflow gallery |
| `GET` | `/generated/*` | **Static asset serving — unauthenticated** |

Note the last row. `/generated/` is explicitly exempted from auth (`main.py:34`), so any generated asset is readable by anyone who has or can guess the URL. Filenames are UUIDs, so it is not trivially enumerable, but it is not access-controlled either.

---

## 5. What does *not* exist

This list matters more than the feature list, because it defines the distance between "working tool" and "sellable product."

**Commercial primitives — all absent:**
- No billing, payments, plans, or subscriptions
- No credits, quotas, or usage limits of any kind
- No cost tracking or spend estimation — the app never records what a generation cost
- No user accounts, signup, email, password reset, or roles
- No per-user data isolation (the gallery is global; two users would see each other's work)
- No analytics, telemetry, or product instrumentation — you cannot currently answer "which model is used most?"

**Engineering gaps that block scale:**
- No database, no migrations; JSON-file storage with full-directory reads on every list
- No object storage — assets live on the container's local disk and vanish with it
- No queue; a single worker thread with a global 5s lock serialises the entire deployment
- No retries on Replicate failures; a failed step kills the whole workflow run (`workflows.py:205-212`)
- No tests, no CI, no linting
- No structured logging, error tracking, or alerting — failures surface only in `print()` output
- No API keys or programmatic access for third parties

**Trust and safety:**
- Safety filters are **explicitly disabled** on four models: `disable_safety_filter: True` (p-video), `disable_safety_checker: True` (p-image-lora, p-image-edit, flux-2-klein-9b). Acceptable for a solo operator; a hard blocker for anything public-facing.
- No content moderation, no terms of service, no abuse reporting, no rate limiting per user.

**Security items to fix before exposing this to anyone else:**
- Default credentials `admin`/`admin` (`main.py:29-30`)
- `CORSMiddleware(allow_origins=["*"])` combined with bearer auth (`main.py:46-51`)
- Auth token accepted as a URL query parameter (`main.py:59`) — leaks into logs, referrers, and browser history
- In-memory token set: all sessions drop on every restart or deploy
- Unauthenticated `/generated/` static mount

---

## 6. Notable engineering strengths

Worth protecting when you plan work — these are why the roadmap in `MONETIZATION.md` is cheaper than it would otherwise be:

1. **The model abstraction is genuinely good.** `ImageModel` (`models/base.py`) declares capabilities as boolean properties (`accepts_image`, `supports_duration`, `supports_lora`, `is_multi_reference`, `supports_captions`, `supports_aspect_ratio`), the job runner dispatches on those flags, and the frontend renders controls from the same flags via `GET /models`. New models are ~80 lines and one registry entry.
2. **Real production learnings are baked in.** The Grok base64 workaround, HEIC handling, background whitening, 1 MP normalisation, the global rate limiter, and the coloring-book style/negative prompt pair are all hard-won details that a rewrite would lose.
3. **The workflow engine is more capable than it looks** — branching via `source_step_index` and run-scoped slot resolution are non-obvious design choices that were clearly driven by real use.
4. **Progressive UX throughout** — polling, per-image status, partial-failure tolerance within a job (one image failing does not kill the batch).

---

## 7. Suggested first week

1. Run it. `export REPLICATE_API_TOKEN=... && docker compose up --build`, then build a 3-step workflow (z-image-turbo → p-video → tiktok-captions) on a 1-hour schedule and let it run overnight. Nothing in this document substitutes for watching the pipeline produce content unattended.
2. Get the owner's actual Replicate invoice for a representative month and reconcile it against output volume. Unit economics are the gating input to every decision in the monetization doc, and the app cannot tell you them.
3. Read `MONETIZATION.md` and pull the trigger on the Phase 0/1 sequencing question with the owner.
