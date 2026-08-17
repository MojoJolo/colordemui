import io
import os
from typing import Optional

from app.services.models.base import ImageModel


class Gpt5NanoModel(ImageModel):
    """
    Text generation via openai/gpt-5-nano.
    Takes a prompt and an optional reference image, and returns text —
    typically used in a workflow to write the prompt for a later image step.
    """

    @property
    def model_id(self) -> str:
        return "openai/gpt-5-nano"

    @property
    def output_extension(self) -> str:
        return ".txt"

    @property
    def accepts_image(self) -> bool:
        return True

    @property
    def is_text(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        if not prompt:
            raise ValueError("gpt-5-nano requires a prompt")

        payload = {"prompt": prompt}
        if image_bytes is not None:
            payload["image_input"] = [io.BytesIO(image_bytes)]

        image_info = f"<{len(image_bytes)} bytes>" if image_bytes is not None else "none"
        print(f"[gpt-5-nano] prompt={prompt!r} image={image_info}")

        output = self._replicate_run(self.model_id, input=payload)
        text = self._extract_text(output).strip()
        if not text:
            raise ValueError("gpt-5-nano returned empty text")
        print(f"[gpt-5-nano] response ({len(text)} chars): {text[:200]!r}")
        return text.encode("utf-8")
