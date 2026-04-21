import io
import os
import random
from typing import List, Optional

from app.services.models.base import ImageModel


class FluxKlein9bModel(ImageModel):
    """
    Multi-reference image generation via black-forest-labs/flux-2-klein-9b.
    All uploaded images are shared reference inputs.
    The model does not support num_outputs or aspect_ratio — each call returns
    one image, and dimensions automatically match the input image when omitted.
    """

    @property
    def model_id(self) -> str:
        return "black-forest-labs/flux-2-klein-9b"

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
        raise NotImplementedError("FluxKlein9bModel uses generate_multi(), not generate()")

    def generate_one(
        self,
        prompt: str,
        ref_images: List[bytes],
        seed: Optional[int] = None,
        aspect_ratio: str = "9:16",
    ) -> bytes:
        """Single API call → single image bytes."""
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        if not ref_images:
            raise ValueError("FluxKlein9bModel requires at least one reference image.")

        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        payload = {
            "prompt": prompt,
            "input_images": [io.BytesIO(b) for b in ref_images],
            "seed": seed,
            "disable_safety_checker": True,
            "aspect_ratio": aspect_ratio,
        }

        loggable = {
            **payload,
            "input_images": [f"<image bytes: {len(b)} bytes>" for b in ref_images],
        }
        print(f"[flux-2-klein-9b] request: {loggable}")

        output = self._replicate_run(self.model_id, input=payload)
        return self._extract_bytes(output)

    def generate_multi(
        self,
        prompt: str,
        ref_images: List[bytes],
        num_outputs: int = 1,
        seed: Optional[int] = None,
        aspect_ratio: str = "9:16",
    ) -> List[bytes]:
        """Make num_outputs sequential API calls, incrementing seed each time."""
        results = []
        for i in range(num_outputs):
            img_seed = (seed + i) if seed is not None else None
            results.append(self.generate_one(prompt, ref_images, img_seed, aspect_ratio))
        return results
