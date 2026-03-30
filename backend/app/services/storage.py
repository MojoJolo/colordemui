import json
from pathlib import Path
from typing import Optional, List

from app.models import JobRecord

# SVG/PNG output files — served as static at /generated/<filename>
GENERATED_DIR = Path("generated")

# Job metadata + reference images — not served as static
JOBS_DIR = Path("jobs")


def image_file_path(filename: str) -> Path:
    """Path for any generated output file (SVG, PNG, etc.)."""
    return GENERATED_DIR / filename


def job_metadata_path(job_id: str) -> Path:
    return JOBS_DIR / f"{job_id}.json"


def ref_image_path(job_id: str) -> Path:
    """Path for the reference image used in img2img jobs."""
    return JOBS_DIR / f"ref_{job_id}.png"


def save_job(job: JobRecord) -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    job_metadata_path(job.job_id).write_text(job.model_dump_json(indent=2))


def load_job(job_id: str) -> Optional[JobRecord]:
    path = job_metadata_path(job_id)
    if not path.exists():
        return None
    return JobRecord(**json.loads(path.read_text()))


def load_all_jobs() -> List[JobRecord]:
    """Load all job metadata files, sorted oldest-first."""
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    jobs = []
    for p in sorted(JOBS_DIR.glob("*.json")):
        try:
            jobs.append(JobRecord(**json.loads(p.read_text())))
        except Exception as exc:
            print(f"Warning: could not load {p.name}: {exc}")
    return jobs


def delete_image_file(filename: str) -> None:
    p = image_file_path(filename)
    if p.exists():
        p.unlink()
