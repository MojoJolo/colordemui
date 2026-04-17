from typing import List, Optional
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
