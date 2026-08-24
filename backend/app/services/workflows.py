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


def _filenames_by_ids(image_ids: List[str]) -> List[str]:
    """Resolve image IDs to filenames relative to GENERATED_DIR, skipping missing files."""
    from app.services import jobs as job_service
    all_images = job_service.get_all_images()
    id_to_filename = {img.image_id: img.filename for img in all_images if img.filename}
    result = []
    for image_id in image_ids:
        filename = id_to_filename.get(image_id)
        if filename and (GENERATED_DIR / filename).exists():
            result.append(filename)
    return result


def _load_images_by_ids(image_ids: List[str]) -> List[bytes]:
    """Load image bytes from disk for the given image IDs."""
    return [(GENERATED_DIR / f).read_bytes() for f in _filenames_by_ids(image_ids)]


def _load_media_by_id(image_id: str) -> bytes:
    """
    Load one picked file. Unlike _load_images_by_ids this raises instead of
    skipping, because a merge list names each file explicitly and silently
    dropping one would reorder the result.
    """
    filenames = _filenames_by_ids([image_id])
    if not filenames:
        raise ValueError(
            f"A selected file is no longer on disk (id {image_id}). "
            "Re-pick it on the step."
        )
    return (GENERATED_DIR / filenames[0]).read_bytes()


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


def duplicate_workflow(workflow_id: str) -> Optional[WorkflowConfig]:
    """
    Clone a workflow's configuration under a new id and slug. Run history is not
    copied, and the copy starts disabled so it does not fire on the shared
    schedule before it has been reviewed.
    """
    src = workflow_storage.load_workflow(workflow_id)
    if not src:
        return None

    now = utcnow()
    name = f"{src.name} (copy)"
    copy = WorkflowConfig(
        workflow_id=str(uuid.uuid4()),
        name=name,
        slug=_unique_slug(name),
        # Fresh step_ids so the copy's runs never collide with the original's
        steps=[s.model_copy(update={"step_id": str(uuid.uuid4())}, deep=True) for s in src.steps],
        slot_lists={slot: list(words) for slot, words in src.slot_lists.items()},
        schedule_value=src.schedule_value,
        schedule_unit=src.schedule_unit,
        enabled=False,
        created_at=now,
        updated_at=now,
    )
    workflow_storage.save_workflow(copy)
    return copy


def delete_workflow(workflow_id: str) -> bool:
    return workflow_storage.delete_workflow(workflow_id)


def list_workflows() -> List[WorkflowConfig]:
    return workflow_storage.load_all_workflows()


def get_workflow(workflow_id: str) -> Optional[WorkflowConfig]:
    return workflow_storage.load_workflow(workflow_id)


def _is_merger_model(name: str) -> bool:
    try:
        return model_registry.get_model(name).is_merger
    except ValueError:
        return False


def _is_upload_model(name: str) -> bool:
    try:
        return model_registry.get_model(name).is_upload
    except ValueError:
        return False


def _step_num_outputs(s) -> int:
    # A merger always produces exactly one combined file; an upload step produces
    # exactly the images it holds. Keeping these accurate keeps run progress honest.
    if _is_merger_model(s.model):
        return 1
    if _is_upload_model(s.model):
        return max(1, len(getattr(s, "initial_image_ids", []) or []))
    return s.num_outputs


def _build_step(s) -> WorkflowStep:
    return WorkflowStep(
        step_id=s.step_id or str(uuid.uuid4()),
        model=s.model,
        num_outputs=_step_num_outputs(s),
        prompt_template=s.prompt_template,
        aspect_ratio=getattr(s, "aspect_ratio", "9:16"),
        duration=getattr(s, "duration", 5),
        resolution=getattr(s, "resolution", "768P"),
        save_audio=getattr(s, "save_audio", True),
        initial_image_ids=getattr(s, "initial_image_ids", []),
        source_step_index=getattr(s, "source_step_index", None),
        merge_source_steps=getattr(s, "merge_source_steps", []),
        merge_items=getattr(s, "merge_items", []),
        language=getattr(s, "language", "english"),
        caption_size=getattr(s, "caption_size", 40),
        overlay_text_size=getattr(s, "overlay_text_size", 9),
        overlay_position=getattr(s, "overlay_position", "center"),
        overlay_blur=getattr(s, "overlay_blur", 0),
        overlay_color=getattr(s, "overlay_color", "#ffffff"),
        overlay_outline_color=getattr(s, "overlay_outline_color", "#000000"),
        overlay_outline_width=getattr(s, "overlay_outline_width", 100),
    )


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

_TEXT_PLACEHOLDER_RE = re.compile(r"\{(?:step(\d+)_)?text\}")


def _produces_text(step: WorkflowStep) -> bool:
    try:
        return model_registry.get_model(step.model).is_text
    except ValueError:
        return False


def _resolve_text_placeholders(
    prompt: str,
    index: int,
    wf: WorkflowConfig,
    step_texts: dict,
) -> str:
    """
    Substitute {text} (the nearest preceding text step's output) and
    {stepN_text} (that step's output, 1-indexed to match the UI).
    """
    def replace(match) -> str:
        if match.group(1):
            n = int(match.group(1))
            src = n - 1
            if not 0 <= src < index:
                raise ValueError(
                    f"Step {index + 1} uses {match.group(0)}, but Step {n} does not come before it."
                )
            if src not in step_texts:
                raise ValueError(
                    f"Step {index + 1} uses {match.group(0)}, but Step {n} "
                    f"('{wf.steps[src].model}') does not produce text."
                )
            return step_texts[src]

        for s in range(index - 1, -1, -1):
            if s in step_texts:
                return step_texts[s]
        raise ValueError(
            f"Step {index + 1} uses {{text}} but no earlier step produces text. "
            "Add a text step (e.g. gpt-5-nano) before it."
        )

    return _TEXT_PLACEHOLDER_RE.sub(replace, prompt)


def _resolve_ref_bytes(
    step: WorkflowStep,
    index: int,
    wf: WorkflowConfig,
    step_outputs: dict,
) -> List[bytes]:
    """Pick the reference images for a step: its configured source, else the nearest preceding step."""
    if step.source_step_index is not None:
        src = step.source_step_index
        if 0 <= src < index and _produces_text(wf.steps[src]):
            raise ValueError(
                f"Step {index + 1} is set to take images from Step {src + 1}, but "
                f"'{wf.steps[src].model}' produces text. Use a {{step{src + 1}_text}} "
                "placeholder in the prompt instead."
            )
        return step_outputs.get(src, [])

    # step_outputs holds no text steps, so this naturally skips over them
    for s in range(index - 1, -1, -1):
        if step_outputs.get(s):
            return step_outputs[s]
    return []


def _produces_video(step: WorkflowStep) -> bool:
    try:
        return model_registry.get_model(step.model).output_extension == ".mp4"
    except ValueError:
        return False


def _collect_merge_clips(
    step: WorkflowStep,
    index: int,
    wf: WorkflowConfig,
    step_outputs: dict,
) -> List[bytes]:
    """Gather the videos a merger step should join, in playback order."""
    sources = [s for s in step.merge_source_steps if 0 <= s < index]
    if not sources:
        sources = [s for s in range(index) if _produces_video(wf.steps[s])]
    if not sources:
        raise ValueError(
            f"Step {index + 1} merges videos but no earlier step produces video output."
        )

    clips: List[bytes] = []
    for s in sources:
        if not _produces_video(wf.steps[s]):
            raise ValueError(
                f"Step {index + 1} is set to merge Step {s + 1}, "
                f"but '{wf.steps[s].model}' does not produce video."
            )
        clips.extend(step_outputs.get(s, []))

    if len(clips) < 2:
        picked = ", ".join(f"Step {s + 1}" for s in sources)
        raise ValueError(
            f"Step {index + 1} needs at least 2 videos to merge but got {len(clips)} "
            f"from {picked}. Increase that step's Outputs or select more source steps."
        )
    return clips


def _collect_merge_items(
    step: WorkflowStep,
    index: int,
    wf: WorkflowConfig,
    step_outputs: dict,
) -> List[dict]:
    """
    Build the media merger's playlist from its ordered picks.

    A "step" pick expands to every file that step produced, so one entry can
    stand for a multi-output step; an "image" pick is a single file from the
    gallery. Duplicates are kept as-is — repeating a clip, once forwards and
    once reversed, is the point.
    """
    if not step.merge_items:
        raise ValueError(
            f"Step {index + 1} merges media but nothing is selected. "
            "Pick the images and videos to join, in order."
        )

    items: List[dict] = []
    for pos, pick in enumerate(step.merge_items):
        label = f"Step {index + 1} item {pos + 1}"
        if pick.source == "step":
            src = pick.step_index
            if src is None or not 0 <= src < index:
                raise ValueError(
                    f"{label} points at Step {(src or 0) + 1}, which does not come before it."
                )
            outputs = step_outputs.get(src, [])
            if not outputs:
                raise ValueError(
                    f"{label} takes Step {src + 1}'s output, but that step produced no "
                    "image or video."
                )
            for k, data in enumerate(outputs):
                items.append({
                    "data": data,
                    "reverse": pick.reverse,
                    "seconds": pick.seconds,
                    "label": f"{label} (Step {src + 1} output {k + 1})",
                })
        else:
            if not pick.image_id:
                raise ValueError(f"{label} has no file selected.")
            items.append({
                "data": _load_media_by_id(pick.image_id),
                "reverse": pick.reverse,
                "seconds": pick.seconds,
                "label": label,
            })

    if len(items) < 2:
        raise ValueError(
            f"Step {index + 1} needs at least 2 items to merge but got {len(items)}."
        )
    return items


def _generate_kwargs(model, step: WorkflowStep) -> dict:
    kwargs = {}
    if model.supports_duration:
        kwargs.update(duration=step.duration, save_audio=step.save_audio)
    if model.supports_aspect_ratio:
        kwargs["aspect_ratio"] = step.aspect_ratio
    if model.supports_resolution:
        kwargs["resolution"] = step.resolution
    if model.supports_captions:
        kwargs.update(language=step.language, caption_size=step.caption_size)
    return kwargs


def _processor_kwargs(model, step: WorkflowStep) -> dict:
    if not model.supports_text_overlay:
        return {}
    return {
        "overlay_text_size": step.overlay_text_size,
        "overlay_position": step.overlay_position,
        "overlay_blur": step.overlay_blur,
        "overlay_color": step.overlay_color,
        "overlay_outline_color": step.overlay_outline_color,
        "overlay_outline_width": step.overlay_outline_width,
    }


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

    # step_outputs[i] holds the produced image/video bytes for step i once it
    # completes; text steps write to step_texts instead so their output is never
    # handed to a later step as a reference image.
    step_outputs: dict[int, List[bytes]] = {}
    step_texts: dict[int, str] = {}

    # Pick one value per slot for the entire run so all steps share the same context
    picked_slots = {slot: [random.choice(words)] for slot, words in wf.slot_lists.items() if words}

    for i, step in enumerate(wf.steps):
        model = model_registry.get_model(step.model)
        output_dir = GENERATED_DIR / wf.slug
        output_dir.mkdir(parents=True, exist_ok=True)

        step_result = WorkflowStepResult(step_id=step.step_id, status="running")
        run.step_results.append(step_result)
        workflow_storage.save_run(run)

        produced_bytes: List[bytes] = []
        try:
            prompt = resolve_prompt(step.prompt_template, picked_slots)
            prompt = _resolve_text_placeholders(prompt, i, wf, step_texts)
            run.resolved_prompts.append(prompt)

            # Resolve which step's output to use as reference input
            ref_bytes = _resolve_ref_bytes(step, i, wf, step_outputs)
            if not ref_bytes and step.initial_image_ids:
                ref_bytes = _load_images_by_ids(step.initial_image_ids)
            if model.is_upload:
                produced_bytes = _load_images_by_ids(step.initial_image_ids)
                if not produced_bytes:
                    raise ValueError(
                        f"Step {i + 1} supplies uploaded images but none are selected. "
                        "Upload or pick an image on that step."
                    )
            elif model.is_media_merger:
                items = _collect_merge_items(step, i, wf, step_outputs)
                produced_bytes.append(model.merge_media(items))
            elif model.is_merger:
                clips = _collect_merge_clips(step, i, wf, step_outputs)
                produced_bytes.append(model.merge(clips))
            elif model.is_processor:
                if not ref_bytes:
                    raise ValueError(
                        f"Step {i + 1} transforms an image or video but got none. "
                        "Put it after a step that produces one, or pick a file on the step."
                    )
                for data in ref_bytes:
                    produced_bytes.append(
                        model.process(data, prompt, **_processor_kwargs(model, step))
                    )
            else:
                for j in range(step.num_outputs):
                    if model.is_multi_reference:
                        ref_images = ref_bytes
                        if not ref_images:
                            raise ValueError(
                                f"Step {i + 1} uses '{step.model}' which requires reference images, "
                                "but none are available from the source step or configured initial images."
                            )
                        img_bytes = model.generate_one(prompt, ref_images, seed=None, aspect_ratio=step.aspect_ratio)
                    elif ref_bytes and model.accepts_image:
                        ref = ref_bytes[j % len(ref_bytes)]
                        img_bytes = model.generate(prompt, ref, **_generate_kwargs(model, step))
                    else:
                        img_bytes = model.generate(prompt, None, **_generate_kwargs(model, step))
                    produced_bytes.append(img_bytes)

            if model.is_upload:
                # Point at the uploaded files instead of copying them into every run
                filenames = _filenames_by_ids(step.initial_image_ids)
            else:
                filenames = []
                for k, img_bytes in enumerate(produced_bytes):
                    fname = f"{run_id}_step{i}_{k}{model.extension_for(img_bytes)}"
                    (output_dir / fname).write_bytes(img_bytes)
                    filenames.append(f"{wf.slug}/{fname}")

            step_result.image_filenames = filenames
            step_result.status = "done"
            if model.is_text:
                step_texts[i] = produced_bytes[0].decode("utf-8", errors="replace")
            else:
                step_outputs[i] = produced_bytes

        except Exception as exc:
            # Keep resolved_prompts aligned with step_results when the failure
            # happened before the prompt was resolved
            if len(run.resolved_prompts) <= i:
                run.resolved_prompts.append(step.prompt_template)
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
            # Upload steps are inputs, not generated output — listing them would
            # repeat the same image once per run, and deleting one from the
            # gallery would remove the source the workflow depends on.
            if si < len(wf.steps) and _is_upload_model(wf.steps[si].model):
                continue
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


def delete_workflow_image(workflow_id: str, image_id: str) -> bool:
    wf = workflow_storage.load_workflow(workflow_id)
    if not wf:
        return False
    runs = workflow_storage.load_all_runs(wf.slug)
    for run in runs:
        for sr in run.step_results:
            for k, fname in enumerate(sr.image_filenames):
                if f"{run.run_id}_{sr.step_id}_{k}" == image_id:
                    path = GENERATED_DIR / fname
                    if path.exists():
                        path.unlink()
                    sr.image_filenames.pop(k)
                    workflow_storage.save_run(run)
                    return True
    return False


def get_run_progress(run: WorkflowRunRecord, wf: WorkflowConfig) -> dict:
    total = sum(s.num_outputs for s in wf.steps)
    completed = sum(len(sr.image_filenames) for sr in run.step_results if sr.status == "done")
    # A processor step produces one file per input, a count the config cannot
    # know, so keep the bar from running past 100%.
    return {"total": max(total, completed), "completed": completed}
