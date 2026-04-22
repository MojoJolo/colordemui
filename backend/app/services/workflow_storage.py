import json
from pathlib import Path
from typing import Optional, List

from app.models import WorkflowConfig, WorkflowRunRecord

WORKFLOWS_DIR = Path("workflows")
RUNS_DIR = Path("workflows/_runs")


def workflow_config_path(workflow_id: str) -> Path:
    return WORKFLOWS_DIR / f"{workflow_id}.json"


def workflow_run_dir(slug: str) -> Path:
    return RUNS_DIR / slug


def workflow_run_path(slug: str, run_id: str) -> Path:
    return RUNS_DIR / slug / f"{run_id}.json"


def save_workflow(wf: WorkflowConfig) -> None:
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    workflow_config_path(wf.workflow_id).write_text(wf.model_dump_json(indent=2))


def load_workflow(workflow_id: str) -> Optional[WorkflowConfig]:
    path = workflow_config_path(workflow_id)
    if not path.exists():
        return None
    return WorkflowConfig(**json.loads(path.read_text()))


def load_all_workflows() -> List[WorkflowConfig]:
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    workflows = []
    for p in sorted(WORKFLOWS_DIR.glob("*.json")):
        try:
            workflows.append(WorkflowConfig(**json.loads(p.read_text())))
        except Exception as exc:
            print(f"Warning: could not load workflow {p.name}: {exc}")
    return workflows


def delete_workflow(workflow_id: str) -> bool:
    path = workflow_config_path(workflow_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def save_run(run: WorkflowRunRecord) -> None:
    run_dir = workflow_run_dir(run.workflow_slug)
    run_dir.mkdir(parents=True, exist_ok=True)
    workflow_run_path(run.workflow_slug, run.run_id).write_text(run.model_dump_json(indent=2))


def load_run(slug: str, run_id: str) -> Optional[WorkflowRunRecord]:
    path = workflow_run_path(slug, run_id)
    if not path.exists():
        return None
    return WorkflowRunRecord(**json.loads(path.read_text()))


def load_all_runs(slug: str) -> List[WorkflowRunRecord]:
    run_dir = workflow_run_dir(slug)
    if not run_dir.exists():
        return []
    runs = []
    for p in sorted(run_dir.glob("*.json")):
        try:
            runs.append(WorkflowRunRecord(**json.loads(p.read_text())))
        except Exception as exc:
            print(f"Warning: could not load run {p.name}: {exc}")
    return runs
