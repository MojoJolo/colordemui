# Backend

FastAPI server for the Coloring Book Generator.

## Setup

```bash
pip install -r requirements.txt
```

## Run

From the `backend/` directory:

```bash
uvicorn app.main:app --reload
```

The server starts on `http://localhost:8000`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REPLICATE_API_TOKEN` | Yes | Your Replicate API token |
| `TEXT_OVERLAY_FONT` | No | Path to a `.ttf` used by the `text-overlay` step (defaults to the first DejaVu/Liberation face found) |

## Local workflow steps

Most workflow steps call a Replicate model, but a few run locally and need no
API token:

| Step | What it does |
|------|--------------|
| `upload-image` | Supplies the images picked on the step, so later steps can reference them |
| `merge-videos` | Joins whole earlier video steps into one MP4, in step order |
| `merge-media` | Joins an explicit, ordered pick list of generated images and videos. The same file may appear more than once, each entry has its own **reverse** flag, and stills are held for a configurable number of seconds |
| `text-overlay` | Burns a large caption over each image or video it receives, with an optional blur behind the text. The caption is the step's resolved prompt, so `{text}` pulls it from an earlier text step |

`merge-videos`, `merge-media` and `text-overlay` shell out to ffmpeg — either a
system install or the `imageio-ffmpeg` binary that comes with the requirements.
`text-overlay` also needs a TrueType font: the Docker image installs
`fonts-dejavu-core`, and `TEXT_OVERLAY_FONT` overrides the search with a
specific `.ttf` path.

## Generated files

Images and metadata are stored under `backend/generated/<job_id>/`:

```
generated/
  <job_id>/
    metadata.json    Job + image state
    <image_id>.svg   Generated SVG file (one per prompt)
    output.pdf       Generated when the user downloads the PDF
```
