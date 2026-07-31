# Product Overview — Feature Inventory

**Audience:** incoming Product Manager
**Repo:** `MojoJolo/colordemui`
**Scope:** written from a full read of the codebase at commit `19c84f0` (Apr 2026), then narrowed to the agreed product scope (§2). File references are given so you can verify any claim.

Companion doc: [`MONETIZATION.md`](./MONETIZATION.md) — strategy, pricing, and the gap list.

---

## 1. What this product is

**An unattended production line for short-form social video.**

The repo is named for coloring books and the README still describes that, but the last three months of commits — Workflows, scheduling, prompt slots, branching steps, video models, captions — built something else entirely. With the coloring-book and LoRA branches now cut (§2), what remains is a single coherent pipeline:

```
   text prompt              reference images
        │                          │
        ▼                          ▼
   ┌─────────────────────────────────────┐
   │  GENERATE   z-image-turbo · flux    │   text/refs → still image
   └──────────────────┬──────────────────┘
                      ▼
   ┌─────────────────────────────────────┐
   │  EDIT       p-image-edit            │   18 presets: relight, scene,
   └──────────────────┬──────────────────┘   consistency, upscale…
                      ▼
   ┌─────────────────────────────────────┐
   │  ANIMATE    p-video                 │   image → MP4, first+last frame
   └──────────────────┬──────────────────┘
                      ▼
   ┌─────────────────────────────────────┐
   │  FINISH     tiktok-captions         │   burned-in captions
   └──────────────────┬──────────────────┘
                      ▼
              publishable vertical video

   All four stages chainable and schedulable via the WORKFLOW ENGINE,
   which runs the whole pipeline unattended on a timer.
```

The workflow engine is the product. The models are interchangeable parts; the pipeline is the thing competitors don't have.

### Who it serves right now
One operator — the repo owner — running it locally or via Docker Compose with their own Replicate API token. There is no notion of a second user anywhere in the code.

---

## 2. Scope decision

**Core models** — the product is positioned around these four:

| Model | Role |
|---|---|
| `prunaai/z-image-turbo` | Fast, cheap text→image. The volume workhorse |
| `black-forest-labs/flux-2-klein-9b` | Multi-reference text+image→image. Quality and consistency tier |
| `prunaai/p-image-edit` | Image editing, 18 named presets |
| `prunaai/p-video` | Image→video with first/last-frame control |

**Secondary models** — kept in the repo as supporting options, not positioned in marketing:

| Model | Role | Overlaps with |
|---|---|---|
| `shreejalmaharjan-27/tiktok-short-captions` | Video → captioned video. The pipeline's finishing step | — |
| `google/nano-banana-2` | Text + 0–5 refs → image | z-image-turbo, flux-klein |
| `xai/grok-imagine-video` | Text→video (no source image needed) | p-video |

**Cut** — being removed from the codebase:

| Removed | What goes with it |
|---|---|
| `recraft-ai/recraft-v3-svg` | Coloring Book tab, `STYLE_SUFFIX` / `NEGATIVE_PROMPT` (`models/base.py:24-58`) |
| `black-forest-labs/flux-2-pro` | Photo→coloring-page converter, hard-coded `FLUX_PROMPT` (`flux_2_pro.py:8-13`) |
| `prunaai/p-image-lora` | LoRA tab, and the `lora_weights` / `lora_scale` / `hf_api_token` / `prompt_upsampling` job params threaded through `schemas.py`, `models.py`, `jobs.py` |
| PDF export | `services/pdf.py`, `GET /images/pdf`, the `reportlab` + `cairosvg` dependencies |
| LoRA dataset ZIP | `generate_lora_zip()` (`jobs.py:431-457`), `GET /images/lora-zip`, the trigger-word input in `Toolbar.jsx` |

Note that `whiten_background()` (`utils.py:26`) is used only by the two cut features and can go with them; `normalize_image()` and the HEIC handling stay — they serve every remaining model. **This cut list is a concrete engineering task, sized in [`MONETIZATION.md`](./MONETIZATION.md) §6.**

Two segments disappear with these cuts: Amazon KDP low-content publishing, and LoRA trainers. Neither is served by what remains, and the monetization doc no longer references them.

---

## 3. Architecture in one page

```
┌──────────────────────────────┐         ┌────────────────────────────┐
│  React 18 + Vite SPA         │  HTTP   │  FastAPI (Python 3.10+)    │
│  frontend/                   │◄───────►│  backend/                  │
│  - one tab per model         │  Bearer │  - AuthMiddleware          │
│  - 1.5s polling for progress │  token  │  - Model registry          │
│  - localStorage token        │         │  - APScheduler (workflows) │
└──────────────────────────────┘         └─────────────┬──────────────┘
                                                       │
                                    ┌──────────────────┴──────────────────┐
                            ┌───────▼────────┐                  ┌─────────▼────────┐
                            │ Local filesystem│                  │  Replicate API   │
                            │ generated/*.png │                  │  7 models        │
                            │ jobs/*.json     │                  │  5s global throttle│
                            │ workflows/*.json│                  └──────────────────┘
                            └─────────────────┘
```

**Facts a PM must internalise:**

- **No database.** All state is JSON files on local disk (`services/storage.py`, `workflow_storage.py`). Every list operation reads and parses *every* job file.
- **No multi-tenancy.** One username/password from env vars, defaulting to `admin`/`admin` (`main.py:29-30`). Tokens live in an in-memory Python `set` and are wiped on restart (`main.py:31`).
- **One generation at a time, globally.** `ThreadPoolExecutor(max_workers=1)` (`jobs.py:18`) plus a 5-second global lock between every Replicate call (`models/base.py:9-19`). Ceiling is ~12 generations/minute for the entire deployment, and a single video generation blocks everything behind it for minutes.
- **Costs are pass-through and unmetered.** Every generation bills the operator's Replicate account. Nothing records, estimates, or caps spend.

**Stack:** FastAPI, Pydantic, Replicate SDK, APScheduler, Pillow/pillow-heif · React 18, Vite, plain CSS (no UI framework), `heic2any`.

---

## 4. Feature inventory

### 4.1 The four core models

Each has a purpose-built form tab. Adding a model requires one class plus one registry line (`services/models/__init__.py`) and a React form — the extension pattern is clean and is a genuine asset.

**Z Image Turbo** — `prunaai/z-image-turbo` · text → PNG
Fast, cheap text-to-image; the volume workhorse and the natural anchor for credit pricing. Six aspect ratios mapped to explicit pixel dimensions (`z_image_turbo.py:8-15`), including 9:16 for vertical social. Random seed per call.

**Flux Klein 9B** — `black-forest-labs/flux-2-klein-9b` · text + references → PNG
The quality and consistency tier. Takes multiple shared reference images, so it can hold a character or style across generations. Up to 4 outputs per prompt, each a sequential API call with an auto-incremented seed (`flux_2_klein_9b.py:78-91`) — meaning **cost scales linearly with the output count**, worth remembering for §5 of the monetization doc. Eight aspect ratios.

**P-Image Edit** — `prunaai/p-image-edit` · 1–5 images + prompt → PNG
The most commercially interesting of the four. Accepts an edit target plus up to four references, and exposes **18 named presets** (`PImageEditForm.jsx:14-33`):

| Category | Presets |
|---|---|
| Lighting & restoration | `relight`, `light_restoration` |
| Scene construction | `white_to_scene`, `next_scene`, `add_characters`, `fusion` |
| Consistency | `style_consistency`, `subject_consistency`, `scene_consistency` |
| Stylisation | `to_anime`, `to_3dchibi`, `to_caricature`, `photous`, `anything_to_real` |
| Texture & quality | `extract_texture`, `apply_texture`, `upscale`, `white_film_to_rendering` |

Two clusters matter strategically. The **consistency** presets, combined with Flux Klein's multi-reference input, address the hardest problem in faceless content: keeping a recurring character or style stable across hundreds of posts. The **scene** presets (`white_to_scene`, `relight`, `photous`) are a product-photography workflow in all but name — a plain product shot becomes a lifestyle scene. That opens a second segment, covered in the monetization doc.

**P-Video** — `prunaai/p-video` · image → MP4
Image-to-video with **both first-frame and last-frame control**, which gives real directorial control over motion rather than a blind animate. Duration 1–30 seconds (user-controlled slider), audio toggle, six aspect ratios. Safety filter currently disabled (`p_video.py:52`).

### 4.2 Secondary models

**TikTok Captions** — `shreejalmaharjan-27/tiktok-short-captions` · MP4 → MP4. Burns TikTok-style captions in; language and caption size configurable, plus an optional initial-prompt hint to bias transcription. Functionally the pipeline's last stage — it is what turns raw generated video into a publishable post.

**Nano Banana 2** — `google/nano-banana-2` (Gemini 3.1 Flash Image). Text + 0–5 optional references → PNG. References are optional, so it doubles as pure text-to-image.

**Grok Video** — `xai/grok-imagine-video`. Text→video up to 8s, optionally seeded with an image *or* an existing video. Covers the text-straight-to-video case that p-video can't (p-video needs a source image). Uses inline base64 encoding to work around Grok rejecting Replicate file URLs (`grok_video.py:78-82`).

### 4.3 Workflows — the scheduled pipeline engine

**Files:** `services/workflows.py`, `services/scheduler.py`, `components/WorkflowConfigTab.jsx` (772 LOC, the largest component in the repo)

This is the strategic feature and the reason the product is defensible. A workflow is a **named, saved, multi-step pipeline that runs on a timer with no human present.**

- **Chained steps.** Each step picks any model. By default a step consumes the previous step's output as its image input. `source_step_index` lets a step pull from *any* earlier step, making the graph a tree rather than a line (`workflows.py:169-173`) — so one generated image can fan out into several different edits or videos in a single run.
- **Seed images.** Step 1 can be pinned to specific images already in the gallery (`initial_image_ids`), which is how you anchor a recurring character.
- **Prompt slots — randomised templating.** Define named lists (e.g. a `subject` slot, one word or phrase per line), write `{subject}` in a step's prompt template, and each run picks a random value. Critically, **one value is chosen per run and shared across every step** (`workflows.py:154`), so a generate→edit→animate→caption chain stays thematically coherent end to end. This is what turns the workflow from a batch tool into a *content variety engine*: one saved workflow produces endless non-repeating posts on theme.
- **Scheduling.** APScheduler interval trigger, configurable in minutes / hours / days, per workflow, with an enable/disable toggle. Schedules rebuild from disk on boot (`scheduler.py:12-17`).
- **Manual trigger** available alongside the schedule.
- **Run history.** Every run persists per-step status, resolved prompts, output filenames, and errors. The UI polls for live progress and offers a per-workflow gallery.

**The user story:** *"Every 6 hours, pick a random topic from my list, generate a vertical image in my established style, put my character in it, animate it for 5 seconds, burn in captions, and drop it in my folder."* That is a faceless content channel on autopilot, and it works today.

### 4.4 Asset management

- **Global gallery** — every image and video ever generated, newest first, persisted across restarts (`GET /images`).
- **Selection model** — per-asset checkbox, select-all / unselect-all / delete-selected, persisted server-side.
- **Lightbox** viewer with inline video playback and download.
- **Input handling** — HEIC/HEIF support (iPhone photos) on both ends, browser-side canvas downscaling to 1 MP, server-side Pillow normalisation as a backstop.

*(PDF and LoRA-ZIP export are being removed — see §2.)*

### 4.5 Platform

- Token auth with a login page; a 401 anywhere in the SPA triggers automatic logout.
- Docker Compose for the whole stack with live reload on both services.
- Model-capability discovery (`GET /models`) that the frontend uses to render model-appropriate controls.
- Global 5-second inter-call delay to stay inside Replicate rate limits.

---

## 5. API surface

*(after the §2 removals)*

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` · `/auth/logout` | Token issue / invalidate |
| `GET` | `/health` | Health check (public) |
| `GET` | `/models` | Model registry + capability flags |
| `GET` | `/images` | All images, all jobs |
| `POST` | `/jobs` | Create generation job (any model) |
| `GET` | `/jobs/{job_id}` | Poll job progress |
| `POST` | `/images/select-all` · `/images/unselect-all` · `/images/{id}/select` | Selection |
| `DELETE` | `/images/{id}` · `/images/selected` | Delete |
| `GET`/`POST` | `/workflows` | List / create |
| `GET`/`PUT`/`DELETE` | `/workflows/{id}` | Read / update / delete |
| `POST` | `/workflows/{id}/trigger` | Run now |
| `GET` | `/workflows/{id}/runs` · `/runs/{run_id}` | Run history |
| `GET`/`DELETE` | `/workflows/{id}/images[/{id}]` | Per-workflow gallery |
| `GET` | `/generated/*` | **Static asset serving — unauthenticated** |

Note the last row: `/generated/` is explicitly exempted from auth (`main.py:34`), so any generated asset is readable by anyone with the URL. Filenames are UUIDs so it isn't trivially enumerable, but it is not access-controlled.

---

## 6. What does *not* exist

This matters more than the feature list — it defines the distance between "working tool" and "sellable product."

**Commercial primitives — all absent:**
- No billing, payments, plans, or subscriptions
- No credits, quotas, or usage limits of any kind
- No cost tracking — the app never records what a generation cost
- No user accounts, signup, email, password reset, or roles
- No per-user data isolation (the gallery is global; two users would see each other's work)
- No analytics or instrumentation — you cannot currently answer "which model is used most?"

**Engineering gaps blocking scale:**
- No database, no migrations; JSON-file storage with full-directory reads on every list
- No object storage — assets live on the container's local disk and vanish with it
- No queue; a single worker thread with a global 5s lock serialises the entire deployment
- No retries on Replicate failures; **a single failed step kills the whole workflow run** (`workflows.py:205-212`) — the worst reliability bug for unattended use
- No tests, no CI, no linting
- No structured logging or error tracking — failures surface only in `print()` output
- No programmatic API access for third parties

**Trust and safety:**
- Safety filters **explicitly disabled** on three of the remaining models: `disable_safety_filter: True` (p-video), `disable_safety_checker: True` (p-image-edit, flux-2-klein-9b). Fine for a solo operator; a hard blocker for anything public-facing.
- No content moderation, terms of service, abuse reporting, or per-user rate limiting.

**Security items to fix before exposing this to anyone else:**
- Default credentials `admin`/`admin` (`main.py:29-30`)
- `CORSMiddleware(allow_origins=["*"])` alongside bearer auth (`main.py:46-51`)
- Auth token accepted as a URL query parameter (`main.py:59`) — leaks into logs, referrers, browser history
- In-memory token set: all sessions drop on every restart or deploy
- Unauthenticated `/generated/` static mount

---

## 7. Engineering strengths worth protecting

These are why the roadmap is cheaper than it would otherwise be:

1. **The model abstraction is genuinely good.** `ImageModel` (`models/base.py`) declares capabilities as boolean properties (`accepts_image`, `supports_duration`, `is_multi_reference`, `supports_edit_preset`, `supports_captions`, `supports_aspect_ratio`); the job runner dispatches on those flags and the frontend renders controls from the same flags via `GET /models`. A new model is ~80 lines plus a registry entry. This also makes adding a second inference provider tractable — see the Replicate-dependency risk in the monetization doc.
2. **Real production learnings are baked in.** The Grok base64 workaround, HEIC handling, 1 MP normalisation, and the global rate limiter are hard-won details a rewrite would lose.
3. **The workflow engine is more capable than it looks.** Branching via `source_step_index` and run-scoped slot resolution are non-obvious choices clearly driven by real use.
4. **Progressive UX throughout** — polling, per-image status, and partial-failure tolerance within a job (one image failing doesn't kill the batch). Note this tolerance does *not* extend to workflow runs, which is the bug called out above.

---

## 8. Suggested first week

1. **Run it.** `export REPLICATE_API_TOKEN=... && docker compose up --build`, then build the flagship four-step workflow (z-image-turbo → p-image-edit → p-video → tiktok-captions) on a 1-hour schedule and let it run overnight. Nothing in this document substitutes for watching the pipeline produce publishable content unattended.
2. **Get the real Replicate invoice** for a representative month and reconcile it against output volume. Unit economics gate every decision in the monetization doc, and the app cannot tell you them.
3. **Read [`MONETIZATION.md`](./MONETIZATION.md)** and settle the phasing question with the owner.
