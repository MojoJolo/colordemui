from enum import Enum
from typing import Optional, List, Dict
from pydantic import BaseModel


class ImageStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class JobStatus(str, Enum):
    running = "running"
    done = "done"


class ImageRecord(BaseModel):
    image_id: str
    prompt: str
    filename: Optional[str] = None
    selected: bool = False
    status: ImageStatus = ImageStatus.pending
    error: Optional[str] = None
    created_at: str
    model: str = "recraft-v3-svg"


class JobRecord(BaseModel):
    job_id: str
    status: JobStatus = JobStatus.running
    created_at: str
    total: int
    completed: int = 0
    images: List[ImageRecord] = []
    model: str = "recraft-v3-svg"
    has_ref_image: bool = False
    seed: Optional[int] = None
    num_ref_images: int = 0
    duration: int = 5
    aspect_ratio: str = "9:16"
    save_audio: bool = True
    lora_weights: Optional[str] = None
    lora_scale: float = 0.5
    hf_api_token: Optional[str] = None
    prompt_upsampling: bool = False


# ---------------------------------------------------------------------------
# Workflow models
# ---------------------------------------------------------------------------

class ScheduleUnit(str, Enum):
    minutes = "minutes"
    hours = "hours"
    days = "days"


class WorkflowStep(BaseModel):
    step_id: str
    model: str
    num_outputs: int = 1
    prompt_template: str = ""
    aspect_ratio: str = "9:16"
    duration: int = 5
    initial_image_ids: List[str] = []


class WorkflowConfig(BaseModel):
    workflow_id: str
    name: str
    slug: str
    steps: List[WorkflowStep] = []
    slot_lists: Dict[str, List[str]] = {}
    schedule_value: int = 60
    schedule_unit: ScheduleUnit = ScheduleUnit.minutes
    enabled: bool = True
    created_at: str
    updated_at: str


class WorkflowStepResult(BaseModel):
    step_id: str
    status: str = "running"
    image_filenames: List[str] = []
    error: Optional[str] = None


class WorkflowRunRecord(BaseModel):
    run_id: str
    workflow_id: str
    workflow_slug: str
    started_at: str
    finished_at: Optional[str] = None
    status: str = "running"
    step_results: List[WorkflowStepResult] = []
    resolved_prompts: List[str] = []
