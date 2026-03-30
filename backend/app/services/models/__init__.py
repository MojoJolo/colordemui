from typing import Dict, List

from app.services.models.base import ImageModel
from app.services.models.recraft import RecraftSVGModel
from app.services.models.flux_2_pro import FluxProModel

# ---------------------------------------------------------------------------
# Registry — add new models here, nothing else needs to change.
# ---------------------------------------------------------------------------
_REGISTRY: Dict[str, ImageModel] = {
    "recraft-v3-svg": RecraftSVGModel(),
    "flux-2-pro": FluxProModel(),
}


def get_model(name: str) -> ImageModel:
    if name not in _REGISTRY:
        raise ValueError(
            f"Unknown model '{name}'. Available: {list(_REGISTRY.keys())}"
        )
    return _REGISTRY[name]


def list_models() -> List[dict]:
    return [
        {
            "id": name,
            "accepts_image": model.accepts_image,
            "output_extension": model.output_extension,
        }
        for name, model in _REGISTRY.items()
    ]
