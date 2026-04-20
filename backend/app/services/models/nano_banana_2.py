import io
import os
from typing import List, Optional

import replicate

from app.services.models.base import ImageModel, STYLE_SUFFIX


class NanoBanana2Model(ImageModel):
    """
    Text-to-image or image-guided generation via google/nano-banana-2 (Gemini 3.1 Flash Image).
    Uses is_multi_reference=True so aspect_ratio flows through generate_one() with no
    changes to jobs.py. Images are optional — zero images performs pure text-to-image.
    """

    @property
    def model_id(self) -> str:
        return "google/nano-banana-2"

    @property
    def output_extension(self) -> str:
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return True

    @property
    def is_multi_reference(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        raise NotImplementedError("NanoBanana2Model uses generate_one()")

    def generate_one(
        self,
        prompt: str,
        ref_images: List[bytes],
        seed: Optional[int] = None,
        aspect_ratio: str = "9:16",
    ) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        full_prompt = f"{prompt}, {STYLE_SUFFIX}"

        payload = {
            "prompt": full_prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": "png",
        }

        # Omit image_input entirely when empty — some models reject an empty array
        if ref_images:
            payload["image_input"] = [io.BytesIO(b) for b in ref_images]

        print(
            f"[nano-banana-2] prompt={prompt!r} aspect_ratio={aspect_ratio!r} "
            f"images={len(ref_images)}"
        )

        output = replicate.run(self.model_id, input=payload)
        return self._extract_bytes(output)
