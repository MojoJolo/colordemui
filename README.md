# Coloring Book Generator

A local web app that generates SVG line-art coloring-book images from text prompts
using [Replicate's recraft-v3-svg model](https://replicate.com/recraft-ai/recraft-v3-svg).

## Requirements

| Tool | Version |
|------|---------|
| Python | 3.10 + |
| Node.js | 18 + |
| Replicate account | [replicate.com](https://replicate.com) |

## Quick start

### 1. Set your API token

```bash
export REPLICATE_API_TOKEN=your_token_here
```

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Run both servers (two terminals)

**Terminal 1 — backend:**
```bash
cd backend
uvicorn app.main:app --reload
# Listening on http://localhost:8000
```

**Terminal 2 — frontend:**
```bash
cd frontend
npm run dev
# Listening on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Docker Compose

Create a `.env` file in the repo root or export the variable in your shell:

```bash
export REPLICATE_API_TOKEN=your_token_here
```

Then start the app from the repo root:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

The compose setup mounts both source trees for live reload and keeps frontend
dependencies in a named Docker volume.

---

## How it works

1. Paste one prompt per line in the textarea and click **Generate Images**.
2. The backend creates a job, assigns each prompt an image slot, and processes
   them **one at a time** via Replicate in a background thread.
3. The frontend polls every 1.5 s and progressively adds images to the gallery
   as they finish.
4. Each generated SVG is saved to `backend/generated/<job_id>/`.
5. Use the **checkboxes** to select which images you want to keep.
6. Click **Download PDF** to export selected images as a US-Letter PDF (one
   image per page, centred).

---

## Project structure

```
backend/
  app/
    main.py                  FastAPI app + all routes
    models.py                Internal Pydantic data models
    schemas.py               API request / response schemas
    utils.py                 Shared helpers
    services/
      storage.py             Read / write metadata JSON + image files
      jobs.py                Job creation, background runner, mutations
      replicate_client.py    Replicate SDK wrapper
      pdf.py                 PDF generation (svglib + reportlab)
  generated/                 Auto-created; one sub-folder per job
  requirements.txt

frontend/
  src/
    App.jsx                  Root component, job state, polling
    api.js                   fetch() wrappers for every backend endpoint
    components/
      PromptForm.jsx
      ProgressPanel.jsx
      Toolbar.jsx
      ImageGrid.jsx
      ImageCard.jsx
    styles.css
  index.html
  package.json
  vite.config.js
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/jobs` | Create job & start generation |
| `GET` | `/jobs/{job_id}` | Poll job state |
| `POST` | `/jobs/{job_id}/images/{image_id}/select` | Toggle selection |
| `DELETE` | `/jobs/{job_id}/images/{image_id}` | Delete one image |
| `POST` | `/jobs/{job_id}/select-all` | Select all images |
| `POST` | `/jobs/{job_id}/unselect-all` | Unselect all images |
| `DELETE` | `/jobs/{job_id}/delete-unselected` | Delete unselected images |
| `GET` | `/jobs/{job_id}/pdf` | Download PDF of selected images |
