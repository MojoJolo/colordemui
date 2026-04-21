import os
import random
from typing import Optional

import replicate

from app.services.models.base import ImageModel

_ASPECT_DIMS: dict[str, tuple[int, int]] = {
    "9:16": (768, 1360),
    "1:1":  (1088, 1088),
    "4:5":  (1088, 1360),
    "16:9": (1360, 768),
    "3:4":  (1024, 1360),
    "2:3":  (896, 1344),
}


class ZImageTurboModel(ImageModel):
    """
    Text-to-image via prunaai/z-image-turbo.
    Supports configurable aspect ratios; defaults to 4:5 (1088×1360).
    """

    @property
    def model_id(self) -> str:
        return "prunaai/z-image-turbo"

    @property
    def output_extension(self) -> str:
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return False

    @property
    def supports_aspect_ratio(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None, aspect_ratio: str = "4:5") -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        seed = random.randint(0, 2**32 - 1)
        width, height = _ASPECT_DIMS.get(aspect_ratio, (1088, 1360))

        payload = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "seed": seed,
        }

        print(f"[z-image-turbo] request: prompt={prompt!r} aspect_ratio={aspect_ratio} ({width}×{height}) seed={seed}")

        output = replicate.run(self.model_id, input=payload)
        return self._extract_bytes(output)
