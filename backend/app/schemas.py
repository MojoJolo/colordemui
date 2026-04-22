from typing import List, Optional, Dict
from pydantic import BaseModel
from app.models import ImageStatus, JobStatus


class CreateJobRequest(BaseModel):
    prompts: List[str]
    model: str = "recraft-v3-svg"
    image_data: Optional[List[str]] = None  # list of base64 data URIs, required for img2img models
    seed: Optional[int] = None
    num_outputs: int = 1
    selected_image_id: Optional[str] = None             # reference an already-generated image on disk
    selected_last_frame_image_id: Optional[str] = None  # reference image for the last frame
    first_frame_data: Optional[str] = None              # base64 data URI upload for first frame
    last_frame_data: Optional[str] = None               # base64 data URI upload for last frame
    duration: int = 5
    aspect_ratio: str = "9:16"
    save_audio: bool = True
    lora_weights: Optional[str] = None
    lora_scale: float = 0.5
    hf_api_token: Optional[str] = None
    prompt_upsampling: bool = False


class SelectRequest(BaseModel):
    selected: bool


class ImageResponse(BaseModel):
    image_id: str
    prompt: str
    filename: Optional[str] = None
    url: Optional[str] = None
    selected: bool
    status: ImageStatus
    error: Optional[str] = None
    created_at: str
    model: str = "recraft-v3-svg"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    created_at: str
    total: int
    completed: int
    images: List[ImageResponse]


# ---------------------------------------------------------------------------
# Workflow schemas
# ---------------------------------------------------------------------------

class WorkflowStepRequest(BaseModel):
    step_id: Optional[str] = None
    model: str
    num_outputs: int = 1
    prompt_template: str = ""
    aspect_ratio: str = "9:16"
    initial_image_ids: List[str] = []


class WorkflowRequest(BaseModel):
    name: str
    steps: List[WorkflowStepRequest] = []
    slot_lists: Dict[str, List[str]] = {}
    schedule_value: int = 60
    schedule_unit: str = "minutes"
    enabled: bool = True


class WorkflowStepResponse(BaseModel):
    step_id: str
    model: str
    num_outputs: int
    prompt_template: str
    aspect_ratio: str = "9:16"
    initial_image_ids: List[str] = []


class WorkflowResponse(BaseModel):
    workflow_id: str
    name: str
    slug: str
    steps: List[WorkflowStepResponse]
    slot_lists: Dict[str, List[str]]
    schedule_value: int
    schedule_unit: str
    enabled: bool
    created_at: str
    updated_at: str


class WorkflowStepResultResponse(BaseModel):
    step_id: str
    status: str
    image_urls: List[str] = []
    error: Optional[str] = None


class WorkflowRunResponse(BaseModel):
    run_id: str
    workflow_id: str
    started_at: str
    finished_at: Optional[str] = None
    status: str
    total: int
    completed: int
    step_results: List[WorkflowStepResultResponse]
    resolved_prompts: List[str]
