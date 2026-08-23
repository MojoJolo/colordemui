import io
import os
from typing import Optional

from app.services.models.base import ImageModel


class Gpt52Model(ImageModel):
    """
    Text generation via openai/gpt-5.2.
    Same shape as gpt-5-nano — a prompt plus an optional reference image in,
    text out — but the full-size model, for prompt writing that needs more
    reasoning than the nano tier gives.
    """

    @property
    def model_id(self) -> str:
        return "openai/gpt-5.2"

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
            raise ValueError("gpt-5.2 requires a prompt")

        # Checked against the published schema: prompt and image_input match, and
        # the output is an array of strings, which _extract_text joins. The rest
        # are left at their defaults — messages (would override prompt entirely),
        # system_prompt, verbosity=medium, and reasoning_effort=low, which is low
        # enough that reasoning does not eat the whole budget and leave an empty
        # response, so max_completion_tokens needs no raising. Note the effort
        # values differ from gpt-5-nano's: 5.2 takes none/low/medium/high/xhigh,
        # not 'minimal', so don't copy that across if this ever sets it.
        payload = {"prompt": prompt}
        if image_bytes is not None:
            payload["image_input"] = [io.BytesIO(image_bytes)]

        image_info = f"<{len(image_bytes)} bytes>" if image_bytes is not None else "none"
        print(f"[gpt-5.2] prompt={prompt!r} image={image_info}")

        output = self._replicate_run(self.model_id, input=payload)
        text = self._extract_text(output).strip()
        if not text:
            raise ValueError("gpt-5.2 returned empty text")
        print(f"[gpt-5.2] response ({len(text)} chars): {text[:200]!r}")
        return text.encode("utf-8")
