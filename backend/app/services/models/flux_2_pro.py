import io
import os
from typing import Optional

from app.services.models.base import ImageModel
from app.utils import whiten_background

FLUX_PROMPT = (
    "black and white coloring book page, thick bold clean outlines, "
    "no shading, white background, very simple shapes, minimal detail, "
    "large clear objects, easy for seniors, printable coloring worksheet\n"
)


class FluxProModel(ImageModel):
    """
    Image-to-image coloring book conversion via black-forest-labs/flux-2-pro.
    Requires an input image; the uploaded photo becomes the subject.
    """

    @property
    def model_id(self) -> str:
        return "black-forest-labs/flux-2-pro"

    @property
    def output_extension(self) -> str:
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        if image_bytes is None:
            raise ValueError("FluxProModel requires an image input.")

        payload = {
            "prompt": FLUX_PROMPT,
            "input_images": [io.BytesIO(image_bytes)],
            "resolution": "1 MP",
            "aspect_ratio": "1:1",
            "output_format": "png",
            "output_quality": 80,
            "safety_tolerance": 2,
        }

        # Log the request (image bytes replaced with size info)
        loggable = {
            **payload,
            "input_images": [f"<image bytes: {len(image_bytes)} bytes>"],
        }
        print(f"[flux-2-pro] request: {loggable}")

        output = self._replicate_run(self.model_id, input=payload)

        image_bytes = self._extract_bytes(output)
        return whiten_background(image_bytes)
