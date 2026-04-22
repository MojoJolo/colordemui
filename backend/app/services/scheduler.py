import uuid

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.models import WorkflowConfig
from app.services import workflow_storage

_scheduler = BackgroundScheduler(daemon=True)


def start_scheduler() -> None:
    _scheduler.start()
    for wf in workflow_storage.load_all_workflows():
        if wf.enabled:
            _schedule_workflow(wf)
    print(f"[scheduler] started — {len(_scheduler.get_jobs())} job(s) registered")


def shutdown_scheduler() -> None:
    _scheduler.shutdown(wait=False)


def reschedule_workflow(wf: WorkflowConfig) -> None:
    if wf.enabled:
        _schedule_workflow(wf)
    else:
        _remove_job(wf.workflow_id)


def remove_workflow_job(workflow_id: str) -> None:
    _remove_job(workflow_id)


def _schedule_workflow(wf: WorkflowConfig) -> None:
    kwargs = {wf.schedule_unit.value: wf.schedule_value}
    _scheduler.add_job(
        func=_run_workflow_sync,
        trigger=IntervalTrigger(**kwargs),
        id=wf.workflow_id,
        replace_existing=True,
        args=[wf.workflow_id],
    )


def _remove_job(workflow_id: str) -> None:
    try:
        _scheduler.remove_job(workflow_id)
    except Exception:
        pass


def _run_workflow_sync(workflow_id: str) -> None:
    from app.services.workflows import run_workflow
    run_id = str(uuid.uuid4())
    run_workflow(workflow_id, run_id)
