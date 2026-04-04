from typing import List, Optional
from pydantic import BaseModel
from app.models import ImageStatus, JobStatus


class CreateJobRequest(BaseModel):
    prompts: List[str]
    model: str = "recraft-v3-svg"
    image_data: Optional[List[str]] = None  # list of base64 data URIs, required for img2img models


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
