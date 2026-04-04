import asyncio
import base64
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, List

from app.models import ImageRecord, ImageStatus, JobRecord, JobStatus
from app.schemas import ImageResponse, JobResponse
from app.services import storage
from app.services import models as model_registry
from app.services import pdf as pdf_service
from app.utils import utcnow, normalize_image

_executor = ThreadPoolExecutor(max_workers=1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _image_to_response(img: ImageRecord) -> ImageResponse:
    return ImageResponse(
        image_id=img.image_id,
        prompt=img.prompt,
        filename=img.filename,
        url=f"/generated/{img.filename}" if img.filename else None,
        selected=img.selected,
        status=img.status,
        error=img.error,
        created_at=img.created_at,
        model=img.model,
    )


def _to_response(job: JobRecord) -> JobResponse:
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
        total=job.total,
        completed=job.completed,
        images=[_image_to_response(img) for img in job.images],
    )


def _find_image(image_id: str):
    """Search all jobs for a matching image. Returns (job, image) or (None, None)."""
    for job in storage.load_all_jobs():
        for img in job.images:
            if img.image_id == image_id:
                return job, img
    return None, None


# ---------------------------------------------------------------------------
# Job creation
# ---------------------------------------------------------------------------

def create_job(
    prompts: List[str],
    model_name: str = "recraft-v3-svg",
    image_data: Optional[List[str]] = None,
) -> JobRecord:
    job_id = str(uuid.uuid4())

    has_ref_image = False
    if image_data:
        has_ref_image = True
        # Multiple images: one ImageRecord per image, save each reference separately
        images = []
        for data_uri in image_data:
            image_id = str(uuid.uuid4())
            raw = data_uri.split("base64,")[-1]
            img_bytes = normalize_image(base64.b64decode(raw))
            ref_path = storage.ref_image_path_for_image(image_id)
            ref_path.parent.mkdir(parents=True, exist_ok=True)
            ref_path.write_bytes(img_bytes)
            images.append(
                ImageRecord(image_id=image_id, prompt="image", created_at=utcnow(), model=model_name)
            )
    else:
        images = [
            ImageRecord(image_id=str(uuid.uuid4()), prompt=p, created_at=utcnow(), model=model_name)
            for p in prompts
        ]

    job = JobRecord(
        job_id=job_id,
        created_at=utcnow(),
        total=len(images),
        images=images,
        model=model_name,
        has_ref_image=has_ref_image,
    )
    storage.save_job(job)
    return job


# ---------------------------------------------------------------------------
# Background runner
# ---------------------------------------------------------------------------

async def run_job(job_id: str) -> None:
    job = storage.load_job(job_id)
    if not job:
        return

    model = model_registry.get_model(job.model)

    loop = asyncio.get_running_loop()

    for image in job.images:
        image.status = ImageStatus.running
        storage.save_job(job)

        # Load per-image reference file (multi-image) or legacy job-level file
        ref_image_bytes: Optional[bytes] = None
        if job.has_ref_image:
            per_img_path = storage.ref_image_path_for_image(image.image_id)
            legacy_path = storage.ref_image_path(job_id)
            ref_path = per_img_path if per_img_path.exists() else legacy_path
            if ref_path.exists():
                ref_image_bytes = ref_path.read_bytes()

        try:
            image_bytes: bytes = await loop.run_in_executor(
                _executor,
                model.generate,
                image.prompt,
                ref_image_bytes,
            )

            filename = f"{image.image_id}{model.output_extension}"
            storage.GENERATED_DIR.mkdir(exist_ok=True)
            storage.image_file_path(filename).write_bytes(image_bytes)

            image.filename = filename
            image.status = ImageStatus.done

        except Exception as exc:
            image.status = ImageStatus.failed
            image.error = str(exc)
            print(f"[job {job_id[:8]}] failed '{image.prompt[:60]}': {exc}")

        job.completed += 1
        storage.save_job(job)

    job.status = JobStatus.done
    storage.save_job(job)
    print(f"[job {job_id[:8]}] done — {job.total} prompts processed")


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def load_job(job_id: str) -> Optional[JobRecord]:
    return storage.load_job(job_id)


def get_job_response(job_id: str) -> Optional[JobResponse]:
    job = storage.load_job(job_id)
    return _to_response(job) if job else None


def get_all_images() -> List[ImageResponse]:
    images = []
    for job in storage.load_all_jobs():
        images.extend(_image_to_response(img) for img in job.images)
    images.sort(key=lambda x: x.created_at, reverse=True)
    return images


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------

def set_image_selected(image_id: str, selected: bool) -> bool:
    job, img = _find_image(image_id)
    if img is None:
        return False
    img.selected = selected
    storage.save_job(job)
    return True


def delete_image(image_id: str) -> bool:
    for job in storage.load_all_jobs():
        for i, img in enumerate(job.images):
            if img.image_id == image_id:
                if img.filename:
                    storage.delete_image_file(img.filename)
                job.images.pop(i)
                job.total = len(job.images)
                storage.save_job(job)
                return True
    return False


def set_all_selected(selected: bool) -> None:
    for job in storage.load_all_jobs():
        changed = False
        for img in job.images:
            if img.selected != selected:
                img.selected = selected
                changed = True
        if changed:
            storage.save_job(job)


def delete_selected_images() -> None:
    for job in storage.load_all_jobs():
        to_remove = [img for img in job.images if img.selected]
        if not to_remove:
            continue
        for img in to_remove:
            if img.filename:
                storage.delete_image_file(img.filename)
        job.images = [img for img in job.images if not img.selected]
        job.total = len(job.images)
        storage.save_job(job)


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def generate_pdf() -> Optional[Path]:
    selected = [
        img for job in storage.load_all_jobs()
        for img in job.images
        if img.selected and img.filename and img.status == ImageStatus.done
    ]
    if not selected:
        return None

    selected.sort(key=lambda x: x.created_at, reverse=True)
    image_paths = [storage.image_file_path(img.filename) for img in selected]
    output_path = storage.GENERATED_DIR / "output.pdf"
    pdf_service.generate_pdf(image_paths, output_path)
    return output_path
