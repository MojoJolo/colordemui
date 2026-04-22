import random
import re
import uuid
from pathlib import Path
from typing import List, Optional

from app.models import WorkflowConfig, WorkflowRunRecord, WorkflowStep, WorkflowStepResult, ScheduleUnit
from app.services import models as model_registry
from app.services import workflow_storage
from app.services.storage import GENERATED_DIR
from app.utils import utcnow


def _load_images_by_ids(image_ids: List[str]) -> List[bytes]:
    """Load image bytes from disk for the given image IDs."""
    from app.services import jobs as job_service
    all_images = job_service.get_all_images()
    id_to_filename = {img.image_id: img.filename for img in all_images if img.filename}
    result = []
    for image_id in image_ids:
        filename = id_to_filename.get(image_id)
        if filename:
            path = GENERATED_DIR / filename
            if path.exists():
                result.append(path.read_bytes())
    return result


def _derive_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    return slug or "workflow"


def _unique_slug(name: str) -> str:
    base = _derive_slug(name)
    existing = {wf.slug for wf in workflow_storage.load_all_workflows()}
    if base not in existing:
        return base
    counter = 2
    while f"{base}-{counter}" in existing:
        counter += 1
    return f"{base}-{counter}"


def resolve_prompt(template: str, slot_lists: dict) -> str:
    result = template
    for slot, words in slot_lists.items():
        if words:
            result = result.replace(f"{{{slot}}}", random.choice(words))
    return result


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_workflow(request) -> WorkflowConfig:
    slug = _unique_slug(request.name)
    now = utcnow()
    steps = [
        _build_step(s) for s in request.steps
    ]
    wf = WorkflowConfig(
        workflow_id=str(uuid.uuid4()),
        name=request.name,
        slug=slug,
        steps=steps,
        slot_lists=request.slot_lists,
        schedule_value=request.schedule_value,
        schedule_unit=request.schedule_unit,
        enabled=request.enabled,
        created_at=now,
        updated_at=now,
    )
    workflow_storage.save_workflow(wf)
    return wf


def update_workflow(workflow_id: str, request) -> Optional[WorkflowConfig]:
    wf = workflow_storage.load_workflow(workflow_id)
    if not wf:
        return None
    # Re-derive slug only if name changed
    new_slug = wf.slug
    if request.name != wf.name:
        existing = {w.slug for w in workflow_storage.load_all_workflows() if w.workflow_id != workflow_id}
        base = _derive_slug(request.name)
        new_slug = base
        counter = 2
        while new_slug in existing:
            new_slug = f"{base}-{counter}"
            counter += 1
    wf.name = request.name
    wf.slug = new_slug
    wf.steps = [_build_step(s) for s in request.steps]
    wf.slot_lists = request.slot_lists
    wf.schedule_value = request.schedule_value
    wf.schedule_unit = ScheduleUnit(request.schedule_unit)
    wf.enabled = request.enabled
    wf.updated_at = utcnow()
    workflow_storage.save_workflow(wf)
    return wf


def delete_workflow(workflow_id: str) -> bool:
    return workflow_storage.delete_workflow(workflow_id)


def list_workflows() -> List[WorkflowConfig]:
    return workflow_storage.load_all_workflows()


def get_workflow(workflow_id: str) -> Optional[WorkflowConfig]:
    return workflow_storage.load_workflow(workflow_id)


def _build_step(s) -> WorkflowStep:
    return WorkflowStep(
        step_id=s.step_id or str(uuid.uuid4()),
        model=s.model,
        num_outputs=s.num_outputs,
        prompt_template=s.prompt_template,
        aspect_ratio=getattr(s, "aspect_ratio", "9:16"),
        duration=getattr(s, "duration", 5),
        initial_image_ids=getattr(s, "initial_image_ids", []),
    )


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

def run_workflow(workflow_id: str, run_id: str) -> None:
    wf = workflow_storage.load_workflow(workflow_id)
    if not wf:
        print(f"[workflow {workflow_id[:8]}] not found, aborting run")
        return

    run = WorkflowRunRecord(
        run_id=run_id,
        workflow_id=wf.workflow_id,
        workflow_slug=wf.slug,
        started_at=utcnow(),
        status="running",
    )
    workflow_storage.save_run(run)

    prev_image_bytes: List[bytes] = []

    for i, step in enumerate(wf.steps):
        prompt = resolve_prompt(step.prompt_template, wf.slot_lists)
        run.resolved_prompts.append(prompt)

        model = model_registry.get_model(step.model)
        output_dir = GENERATED_DIR / wf.slug
        output_dir.mkdir(parents=True, exist_ok=True)

        step_result = WorkflowStepResult(step_id=step.step_id, status="running")
        run.step_results.append(step_result)
        workflow_storage.save_run(run)

        produced_bytes: List[bytes] = []
        try:
            for j in range(step.num_outputs):
                if model.is_multi_reference:
                    ref_images = prev_image_bytes if prev_image_bytes else _load_images_by_ids(step.initial_image_ids)
                    if not ref_images:
                        raise ValueError(
                            f"Step {i + 1} uses '{step.model}' which requires reference images, "
                            "but none are available from the previous step or configured initial images."
                        )
                    img_bytes = model.generate_one(prompt, ref_images, seed=None, aspect_ratio=step.aspect_ratio)
                elif prev_image_bytes and model.accepts_image:
                    ref = prev_image_bytes[j % len(prev_image_bytes)]
                    kwargs = {"duration": step.duration} if model.supports_duration else {}
                    img_bytes = model.generate(prompt, ref, **kwargs)
                else:
                    kwargs = {"duration": step.duration} if model.supports_duration else {}
                    img_bytes = model.generate(prompt, None, **kwargs)
                produced_bytes.append(img_bytes)

            filenames = []
            for k, img_bytes in enumerate(produced_bytes):
                fname = f"{run_id}_step{i}_{k}{model.output_extension}"
                (output_dir / fname).write_bytes(img_bytes)
                filenames.append(f"{wf.slug}/{fname}")

            step_result.image_filenames = filenames
            step_result.status = "done"
            prev_image_bytes = produced_bytes

        except Exception as exc:
            step_result.status = "failed"
            step_result.error = str(exc)
            run.status = "failed"
            run.finished_at = utcnow()
            workflow_storage.save_run(run)
            print(f"[workflow {workflow_id[:8]}] step {i} failed: {exc}")
            return

        workflow_storage.save_run(run)
        print(f"[workflow {workflow_id[:8]}] step {i+1}/{len(wf.steps)} done — {len(filenames)} image(s)")

    run.status = "done"
    run.finished_at = utcnow()
    workflow_storage.save_run(run)
    print(f"[workflow {workflow_id[:8]}] run {run_id[:8]} complete")


# ---------------------------------------------------------------------------
# Gallery
# ---------------------------------------------------------------------------

def get_workflow_images(workflow_id: str) -> List[dict]:
    wf = workflow_storage.load_workflow(workflow_id)
    if not wf:
        return []
    runs = workflow_storage.load_all_runs(wf.slug)
    images = []
    for run in sorted(runs, key=lambda r: r.started_at, reverse=True):
        for si, sr in enumerate(run.step_results):
            prompt = run.resolved_prompts[si] if si < len(run.resolved_prompts) else ""
            for k, fname in enumerate(sr.image_filenames):
                images.append({
                    "image_id": f"{run.run_id}_{sr.step_id}_{k}",
                    "prompt": prompt,
                    "filename": fname,
                    "url": f"/generated/{fname}",
                    "selected": False,
                    "status": sr.status,
                    "error": sr.error,
                    "created_at": run.started_at,
                    "model": "",
                })
    return images


def get_run_progress(run: WorkflowRunRecord, wf: WorkflowConfig) -> dict:
    total = sum(s.num_outputs for s in wf.steps)
    completed = sum(len(sr.image_filenames) for sr in run.step_results if sr.status == "done")
    return {"total": total, "completed": completed}
