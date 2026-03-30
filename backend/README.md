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

## Generated files

Images and metadata are stored under `backend/generated/<job_id>/`:

```
generated/
  <job_id>/
    metadata.json    Job + image state
    <image_id>.svg   Generated SVG file (one per prompt)
    output.pdf       Generated when the user downloads the PDF
```
