import asyncio
import base64
import functools
import io
import uuid
import zipfile
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
    seed: Optional[int] = None,
    num_outputs: int = 1,
    selected_image_id: Optional[str] = None,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    selected_last_frame_image_id: Optional[str] = None,
    save_audio: bool = True,
    first_frame_data: Optional[str] = None,
    last_frame_data: Optional[str] = None,
    lora_weights: Optional[str] = None,
    lora_scale: float = 0.5,
    hf_api_token: Optional[str] = None,
    prompt_upsampling: bool = False,
) -> JobRecord:
    job_id = str(uuid.uuid4())
    model = model_registry.get_model(model_name)

    if model.is_multi_reference:
        # All image_data items are shared references; create num_outputs output records
        for i, data_uri in enumerate(image_data or []):
            raw = data_uri.split("base64,")[-1]
            img_bytes = normalize_image(base64.b64decode(raw))
            ref_path = storage.multi_ref_image_path(job_id, i)
            ref_path.parent.mkdir(parents=True, exist_ok=True)
            ref_path.write_bytes(img_bytes)

        images = [
            ImageRecord(image_id=str(uuid.uuid4()), prompt=p, created_at=utcnow(), model=model_name)
            for p in prompts
            for _ in range(num_outputs)
        ]
        job = JobRecord(
            job_id=job_id,
            created_at=utcnow(),
            total=len(images),
            images=images,
            model=model_name,
            has_ref_image=bool(image_data),
            seed=seed,
            num_ref_images=len(image_data or []),
        )
    elif selected_image_id or first_frame_data:
        # First frame from gallery or uploaded data URI (e.g. for p-video)
        if selected_image_id:
            _, src_img = _find_image(selected_image_id)
            if not src_img or not src_img.filename:
                raise ValueError(f"Image '{selected_image_id}' not found or has no output file")
            first_bytes = storage.image_file_path(src_img.filename).read_bytes()
        else:
            raw = first_frame_data.split("base64,")[-1]
            first_bytes = normalize_image(base64.b64decode(raw))
        image_id = str(uuid.uuid4())
        ref_path = storage.ref_image_path_for_image(image_id)
        ref_path.parent.mkdir(parents=True, exist_ok=True)
        ref_path.write_bytes(first_bytes)
        # Last frame from gallery or uploaded data URI
        if selected_last_frame_image_id:
            _, src_last = _find_image(selected_last_frame_image_id)
            if src_last and src_last.filename:
                last_bytes = storage.image_file_path(src_last.filename).read_bytes()
                lf_path = storage.last_frame_path_for_image(image_id)
                lf_path.parent.mkdir(parents=True, exist_ok=True)
                lf_path.write_bytes(last_bytes)
        elif last_frame_data:
            raw = last_frame_data.split("base64,")[-1]
            last_bytes = normalize_image(base64.b64decode(raw))
            lf_path = storage.last_frame_path_for_image(image_id)
            lf_path.parent.mkdir(parents=True, exist_ok=True)
            lf_path.write_bytes(last_bytes)
        prompt = prompts[0] if prompts else ""
        images = [ImageRecord(image_id=image_id, prompt=prompt, created_at=utcnow(), model=model_name)]
        job = JobRecord(
            job_id=job_id,
            created_at=utcnow(),
            total=1,
            images=images,
            model=model_name,
            has_ref_image=True,
            duration=duration,
            aspect_ratio=aspect_ratio,
            save_audio=save_audio,
        )
    elif image_data:
        # Per-image reference: one ImageRecord per image
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
        job = JobRecord(
            job_id=job_id,
            created_at=utcnow(),
            total=len(images),
            images=images,
            model=model_name,
            has_ref_image=True,
        )
    else:
        images = [
            ImageRecord(image_id=str(uuid.uuid4()), prompt=p, created_at=utcnow(), model=model_name)
            for p in prompts
            for _ in range(num_outputs)
        ]
        if selected_last_frame_image_id:
            _, src_last = _find_image(selected_last_frame_image_id)
            if src_last and src_last.filename:
                last_bytes = storage.image_file_path(src_last.filename).read_bytes()
                for img in images:
                    lf_path = storage.last_frame_path_for_image(img.image_id)
                    lf_path.parent.mkdir(parents=True, exist_ok=True)
                    lf_path.write_bytes(last_bytes)
        elif last_frame_data:
            raw = last_frame_data.split("base64,")[-1]
            last_bytes = normalize_image(base64.b64decode(raw))
            for img in images:
                lf_path = storage.last_frame_path_for_image(img.image_id)
                lf_path.parent.mkdir(parents=True, exist_ok=True)
                lf_path.write_bytes(last_bytes)
        job = JobRecord(
            job_id=job_id,
            created_at=utcnow(),
            total=len(images),
            images=images,
            model=model_name,
            has_ref_image=False,
            duration=duration,
            aspect_ratio=aspect_ratio,
            save_audio=save_audio,
            lora_weights=lora_weights,
            lora_scale=lora_scale,
            hf_api_token=hf_api_token,
            prompt_upsampling=prompt_upsampling,
            seed=seed,
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

    if model.is_multi_reference:
        # One API call per output image — progress updates after each one
        ref_bytes_list = [
            storage.multi_ref_image_path(job_id, i).read_bytes()
            for i in range(job.num_ref_images)
            if storage.multi_ref_image_path(job_id, i).exists()
        ]

        for i, image in enumerate(job.images):
            image.status = ImageStatus.running
            storage.save_job(job)

            img_seed = (job.seed + i) if job.seed is not None else None

            try:
                fn = functools.partial(
                    model.generate_one,
                    image.prompt,
                    ref_bytes_list,
                    img_seed,
                )
                img_bytes = await loop.run_in_executor(_executor, fn)

                filename = f"{image.image_id}{model.output_extension}"
                storage.GENERATED_DIR.mkdir(exist_ok=True)
                storage.image_file_path(filename).write_bytes(img_bytes)
                image.filename = filename
                image.status = ImageStatus.done

            except Exception as exc:
                image.status = ImageStatus.failed
                image.error = str(exc)
                print(f"[job {job_id[:8]}] image {i + 1}/{len(job.images)} failed: {exc}")

            job.completed += 1
            storage.save_job(job)

        job.status = JobStatus.done
        storage.save_job(job)
        print(f"[job {job_id[:8]}] done — {job.total} images processed")
        return

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
            if model.supports_duration:
                lf_path = storage.last_frame_path_for_image(image.image_id)
                last_frame_bytes = lf_path.read_bytes() if lf_path.exists() else None
                fn = functools.partial(model.generate, image.prompt, ref_image_bytes, job.duration, job.aspect_ratio, last_frame_bytes, job.save_audio)
                image_bytes: bytes = await loop.run_in_executor(_executor, fn)
            elif model.supports_lora:
                fn = functools.partial(
                    model.generate,
                    image.prompt,
                    None,
                    job.aspect_ratio,
                    job.lora_weights,
                    job.lora_scale,
                    job.hf_api_token,
                    job.seed,
                    job.prompt_upsampling,
                )
                image_bytes: bytes = await loop.run_in_executor(_executor, fn)
            else:
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

def generate_lora_zip(trigger_word: str = "") -> Optional[io.BytesIO]:
    _SKIP_EXTS = (".svg", ".mp4", ".webm", ".mov")
    selected = [
        img for job in storage.load_all_jobs()
        for img in job.images
        if img.selected
        and img.status == ImageStatus.done
        and img.filename
        and not img.filename.endswith(_SKIP_EXTS)
    ]
    if not selected:
        return None

    selected.sort(key=lambda x: x.created_at)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, img in enumerate(selected, start=1):
            stem = f"{i:05d}"
            ext = Path(img.filename).suffix
            img_data = storage.image_file_path(img.filename).read_bytes()
            zf.writestr(f"{stem}{ext}", img_data)
            caption = f"{trigger_word} {img.prompt}".strip()
            zf.writestr(f"{stem}.txt", caption)

    buf.seek(0)
    return buf


def generate_pdf() -> Optional[Path]:
    _VIDEO_EXTS = (".mp4", ".webm", ".mov")
    selected = [
        img for job in storage.load_all_jobs()
        for img in job.images
        if img.selected and img.filename and img.status == ImageStatus.done
        and not img.filename.endswith(_VIDEO_EXTS)
    ]
    if not selected:
        return None

    selected.sort(key=lambda x: x.created_at, reverse=True)
    image_paths = [storage.image_file_path(img.filename) for img in selected]
    output_path = storage.GENERATED_DIR / "output.pdf"
    pdf_service.generate_pdf(image_paths, output_path)
    return output_path
