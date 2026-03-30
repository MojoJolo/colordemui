from enum import Enum
from typing import Optional, List
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
