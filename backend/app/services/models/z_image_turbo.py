import os
import random
from typing import Optional

from app.services.models.base import ImageModel


class ZImageTurboModel(ImageModel):
    """
    Text-to-image via prunaai/z-image-turbo.
    Outputs at 1088×1360 (Instagram portrait 4:5) with a random seed each call.
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

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        seed = random.randint(0, 2**32 - 1)

        payload = {
            "prompt": prompt,
            "width": 1088,
            "height": 1360,
            "seed": seed,
        }

        print(f"[z-image-turbo] request: prompt={prompt!r} seed={seed}")

        output = self._replicate_run(self.model_id, input=payload)
        return self._extract_bytes(output)
