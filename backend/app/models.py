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
    resolution: str = "768P"
    save_audio: bool = True
    reference_image_urls: List[str] = []
    reference_video_urls: List[str] = []
    reference_audio_urls: List[str] = []
    lora_weights: Optional[str] = None
    lora_scale: float = 0.5
    hf_api_token: Optional[str] = None
    prompt_upsampling: bool = False
    language: str = "en"
    caption_size: int = 40


# ---------------------------------------------------------------------------
# Workflow models
# ---------------------------------------------------------------------------

class ScheduleUnit(str, Enum):
    minutes = "minutes"
    hours = "hours"
    days = "days"


class MergeItem(BaseModel):
    """
    One entry in a media merger's ordered pick list.

    `source` is "image" for a file picked from the gallery (identified by
    `image_id`) or "step" for the output of the earlier step at `step_index`.
    The same source may appear several times — each entry carries its own
    `reverse` flag, so a clip can play forwards and then backwards.
    """
    source: str = "image"                  # "image" | "step"
    image_id: Optional[str] = None
    step_index: Optional[int] = None
    reverse: bool = False
    seconds: float = 3.0                   # how long a still is held on screen


class WorkflowStep(BaseModel):
    step_id: str
    model: str
    num_outputs: int = 1
    prompt_template: str = ""
    aspect_ratio: str = "9:16"
    duration: int = 5
    resolution: str = "768P"
    save_audio: bool = True
    initial_image_ids: List[str] = []
    source_step_index: Optional[int] = None  # None = use previous step's output
    merge_source_steps: List[int] = []       # merger steps: [] = all preceding video steps
    merge_items: List[MergeItem] = []        # media merger: ordered picks, duplicates allowed
    language: str = "english"
    caption_size: int = 40
    overlay_text_size: int = 9               # text overlay: caption height as a % of the frame
    overlay_position: str = "center"         # top | center | bottom
    overlay_blur: int = 0                    # 0 = no blur, otherwise blur strength 1-100
    overlay_color: str = "#ffffff"          # text fill
    overlay_outline_color: str = "#000000"   # outline drawn around the text
    overlay_outline_width: int = 100         # % of the minimal outline; 0 = none


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
