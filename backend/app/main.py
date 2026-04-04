from pathlib import Path
from typing import List

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import CreateJobRequest, ImageResponse, JobResponse, SelectRequest
from app.services import jobs as job_service
from app.services import models as model_registry

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Coloring Book Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")


# ---------------------------------------------------------------------------
# Health / models
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/models")
def list_models():
    """Return all registered models with their capabilities."""
    return model_registry.list_models()


# ---------------------------------------------------------------------------
# Global image list
# ---------------------------------------------------------------------------

@app.get("/images", response_model=List[ImageResponse])
def get_all_images():
    return job_service.get_all_images()


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@app.post("/jobs", response_model=JobResponse)
async def create_job(request: CreateJobRequest, background_tasks: BackgroundTasks):
    prompts = [p.strip() for p in request.prompts if p.strip()]
    if not prompts:
        raise HTTPException(status_code=400, detail="No valid prompts provided")

    try:
        model = model_registry.get_model(request.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if model.accepts_image and (not request.image_data or len(request.image_data) == 0):
        raise HTTPException(
            status_code=400,
            detail=f"Model '{request.model}' requires an image input.",
        )

    try:
        job = job_service.create_job(
            prompts,
            model_name=request.model,
            image_data=request.image_data,
        )
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
    background_tasks.add_task(job_service.run_job, job.job_id)
    return job_service.get_job_response(job.job_id)


@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str):
    resp = job_service.get_job_response(job_id)
    if not resp:
        raise HTTPException(status_code=404, detail="Job not found")
    return resp


# ---------------------------------------------------------------------------
# Image mutations — static paths BEFORE parameterised paths
# ---------------------------------------------------------------------------

@app.post("/images/select-all")
def select_all():
    job_service.set_all_selected(True)
    return {"ok": True}


@app.post("/images/unselect-all")
def unselect_all():
    job_service.set_all_selected(False)
    return {"ok": True}


@app.delete("/images/selected")
def delete_selected():
    job_service.delete_selected_images()
    return {"ok": True}


@app.get("/images/pdf")
def download_pdf():
    pdf_path = job_service.generate_pdf()
    if not pdf_path:
        raise HTTPException(status_code=400, detail="No selected images for PDF export")
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename="coloring_book.pdf",
    )


@app.post("/images/{image_id}/select")
def select_image(image_id: str, request: SelectRequest):
    if not job_service.set_image_selected(image_id, request.selected):
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


@app.delete("/images/{image_id}")
def delete_image(image_id: str):
    if not job_service.delete_image(image_id):
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}
