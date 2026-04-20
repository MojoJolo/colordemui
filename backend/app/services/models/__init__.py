from typing import Dict, List

from app.services.models.base import ImageModel
from app.services.models.recraft import RecraftSVGModel
from app.services.models.flux_2_pro import FluxProModel
from app.services.models.flux_2_klein_9b import FluxKlein9bModel
from app.services.models.z_image_turbo import ZImageTurboModel
from app.services.models.p_video import PVideoModel
from app.services.models.p_image_lora import PImageLoraModel
from app.services.models.p_image_edit import PImageEditModel
from app.services.models.grok_video import GrokVideoModel

# ---------------------------------------------------------------------------
# Registry — add new models here, nothing else needs to change.
# ---------------------------------------------------------------------------
_REGISTRY: Dict[str, ImageModel] = {
    "recraft-v3-svg": RecraftSVGModel(),
    "flux-2-pro": FluxProModel(),
    "flux-2-klein-9b": FluxKlein9bModel(),
    "z-image-turbo": ZImageTurboModel(),
    "p-video": PVideoModel(),
    "p-image-lora": PImageLoraModel(),
    "p-image-edit": PImageEditModel(),
    "grok-video": GrokVideoModel(),
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
