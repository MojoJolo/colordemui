import os
import secrets
from pathlib import Path
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from app.schemas import CreateJobRequest, ImageResponse, JobResponse, SelectRequest
from app.services import jobs as job_service
from app.services import models as model_registry

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)

AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "admin")
_valid_tokens: set[str] = set()

_PUBLIC_PATHS = {"/auth/login", "/health"}
_PUBLIC_PREFIXES = ("/generated/",)

app = FastAPI(title="Coloring Book Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in _PUBLIC_PATHS or request.url.path.startswith(_PUBLIC_PREFIXES):
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        token = request.query_params.get("token", "")
        if auth.startswith("Bearer "):
            t = auth[7:]
        elif token:
            t = token
        else:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        if t not in _valid_tokens:
            return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)
        return await call_next(request)


app.add_middleware(AuthMiddleware)

app.mount("/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def login(req: LoginRequest):
    if req.username != AUTH_USERNAME or req.password != AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = secrets.token_urlsafe(32)
    _valid_tokens.add(token)
    return {"token": token}


@app.post("/auth/logout")
def logout(request: Request):
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        _valid_tokens.discard(auth[7:])
    return {"ok": True}


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

    has_image_input = bool(request.image_data) or bool(request.selected_image_id)
    if model.accepts_image and not has_image_input:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{request.model}' requires an image input.",
        )

    try:
        job = job_service.create_job(
            prompts,
            model_name=request.model,
            image_data=request.image_data,
            seed=request.seed,
            num_outputs=request.num_outputs,
            selected_image_id=request.selected_image_id,
            duration=request.duration,
            aspect_ratio=request.aspect_ratio,
            selected_last_frame_image_id=request.selected_last_frame_image_id,
            save_audio=request.save_audio,
            first_frame_data=request.first_frame_data,
            last_frame_data=request.last_frame_data,
            lora_weights=request.lora_weights,
            lora_scale=request.lora_scale,
            hf_api_token=request.hf_api_token,
            prompt_upsampling=request.prompt_upsampling,
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


@app.get("/images/lora-zip")
def download_lora_zip(trigger_word: str = ""):
    buf = job_service.generate_lora_zip(trigger_word.strip())
    if not buf:
        raise HTTPException(status_code=400, detail="No selected raster images for LoRA export")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=lora_dataset.zip"},
    )


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
