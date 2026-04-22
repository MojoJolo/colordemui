import os
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from app.schemas import (
    CreateJobRequest, ImageResponse, JobResponse, SelectRequest,
    WorkflowRequest, WorkflowResponse, WorkflowStepResponse,
    WorkflowRunResponse, WorkflowStepResultResponse,
)
from app.services import jobs as job_service
from app.services import models as model_registry
from app.services import workflows as workflow_service
from app.services import workflow_storage
from app.services import scheduler as scheduler_service

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)

AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "admin")
_valid_tokens: set[str] = set()

_PUBLIC_PATHS = {"/auth/login", "/health"}
_PUBLIC_PREFIXES = ("/generated/",)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_service.start_scheduler()
    yield
    scheduler_service.shutdown_scheduler()


app = FastAPI(title="Coloring Book Generator", lifespan=lifespan)

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
    if model.requires_image and not has_image_input:
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


# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------

def _wf_to_response(wf) -> WorkflowResponse:
    return WorkflowResponse(
        workflow_id=wf.workflow_id,
        name=wf.name,
        slug=wf.slug,
        steps=[WorkflowStepResponse(
            step_id=s.step_id,
            model=s.model,
            num_outputs=s.num_outputs,
            prompt_template=s.prompt_template,
            aspect_ratio=s.aspect_ratio,
            initial_image_ids=s.initial_image_ids,
        ) for s in wf.steps],
        slot_lists=wf.slot_lists,
        schedule_value=wf.schedule_value,
        schedule_unit=wf.schedule_unit.value,
        enabled=wf.enabled,
        created_at=wf.created_at,
        updated_at=wf.updated_at,
    )


def _run_to_response(run, wf) -> WorkflowRunResponse:
    progress = workflow_service.get_run_progress(run, wf)
    return WorkflowRunResponse(
        run_id=run.run_id,
        workflow_id=run.workflow_id,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status,
        total=progress["total"],
        completed=progress["completed"],
        step_results=[
            WorkflowStepResultResponse(
                step_id=sr.step_id,
                status=sr.status,
                image_urls=[f"/generated/{fn}" for fn in sr.image_filenames],
                error=sr.error,
            )
            for sr in run.step_results
        ],
        resolved_prompts=run.resolved_prompts,
    )


@app.get("/workflows", response_model=List[WorkflowResponse])
def list_workflows():
    return [_wf_to_response(wf) for wf in workflow_service.list_workflows()]


@app.post("/workflows", response_model=WorkflowResponse)
def create_workflow(request: WorkflowRequest):
    wf = workflow_service.create_workflow(request)
    scheduler_service.reschedule_workflow(wf)
    return _wf_to_response(wf)


@app.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: str):
    wf = workflow_service.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _wf_to_response(wf)


@app.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(workflow_id: str, request: WorkflowRequest):
    wf = workflow_service.update_workflow(workflow_id, request)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    scheduler_service.reschedule_workflow(wf)
    return _wf_to_response(wf)


@app.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: str):
    if not workflow_service.delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    scheduler_service.remove_workflow_job(workflow_id)
    return {"ok": True}


@app.post("/workflows/{workflow_id}/trigger")
def trigger_workflow(workflow_id: str, background_tasks: BackgroundTasks):
    wf = workflow_service.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    run_id = str(uuid.uuid4())
    background_tasks.add_task(workflow_service.run_workflow, workflow_id, run_id)
    return {"run_id": run_id, "workflow_id": workflow_id}


@app.get("/workflows/{workflow_id}/runs")
def list_workflow_runs(workflow_id: str):
    wf = workflow_service.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    runs = workflow_storage.load_all_runs(wf.slug)
    runs.sort(key=lambda r: r.started_at, reverse=True)
    return [_run_to_response(r, wf) for r in runs]


@app.get("/workflows/{workflow_id}/runs/{run_id}", response_model=WorkflowRunResponse)
def get_workflow_run(workflow_id: str, run_id: str):
    wf = workflow_service.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    run = workflow_storage.load_run(wf.slug, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(run, wf)


@app.get("/workflows/{workflow_id}/images", response_model=List[ImageResponse])
def get_workflow_images(workflow_id: str):
    images = workflow_service.get_workflow_images(workflow_id)
    return [ImageResponse(**img) for img in images]
