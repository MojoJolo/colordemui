import os
from typing import Optional

from app.services.models.base import ImageModel


class PImageLoraModel(ImageModel):
    """
    Text-to-image generation with LoRA weights via prunaai/p-image-lora.
    """

    @property
    def model_id(self) -> str:
        return "prunaai/p-image-lora"

    @property
    def output_extension(self) -> str:
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return False

    @property
    def supports_lora(self) -> bool:
        return True

    def generate(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        aspect_ratio: str = "16:9",
        lora_weights: Optional[str] = None,
        lora_scale: float = 0.5,
        hf_api_token: Optional[str] = None,
        seed: Optional[int] = None,
        prompt_upsampling: bool = False,
    ) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        payload = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "lora_scale": lora_scale,
            "prompt_upsampling": prompt_upsampling,
            "disable_safety_checker": True,
        }
        if lora_weights:
            payload["lora_weights"] = lora_weights
        if hf_api_token:
            payload["hf_api_token"] = hf_api_token
        if seed is not None:
            payload["seed"] = seed

        print(f"[p-image-lora] prompt={prompt!r} lora={lora_weights!r} scale={lora_scale} seed={seed}")

        output = self._replicate_run(self.model_id, input=payload)
        return self._extract_bytes(output)
