import io
import os
from typing import Optional, List

import replicate

from app.services.models.base import ImageModel


class PImageEditModel(ImageModel):
    """
    Image editing via prunaai/p-image-edit.
    Accepts 1–5 images (first = edit target, rest = optional references) + a prompt.
    """

    @property
    def model_id(self) -> str:
        return "prunaai/p-image-edit"

    @property
    def output_extension(self) -> str:
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return True

    @property
    def is_multi_reference(self) -> bool:
        return True

    @property
    def supports_edit_preset(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        raise NotImplementedError("PImageEditModel uses generate_one()")

    def generate_one(
        self,
        prompt: str,
        ref_images: List[bytes],
        seed: Optional[int] = None,
        aspect_ratio: str = "match_input_image",
        replicate_weights: Optional[str] = None,
    ) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        if not ref_images:
            raise ValueError("PImageEditModel requires at least one image.")

        payload = {
            "images": [io.BytesIO(b) for b in ref_images],
            "prompt": prompt,
            "aspect_ratio": aspect_ratio or "match_input_image",
            "turbo": True,
            "disable_safety_checker": True,
        }
        if seed is not None:
            payload["seed"] = seed
        if replicate_weights:
            payload["replicate_weights"] = replicate_weights

        print(
            f"[p-image-edit] prompt={prompt!r} preset={replicate_weights!r} "
            f"images={len(ref_images)} seed={seed}"
        )

        output = replicate.run(self.model_id, input=payload)
        return self._extract_bytes(output)
