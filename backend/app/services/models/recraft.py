import os
from typing import Optional

import replicate

from app.services.models.base import ImageModel, STYLE_SUFFIX, NEGATIVE_PROMPT


class RecraftSVGModel(ImageModel):
    """
    Text-to-SVG coloring book images via recraft-ai/recraft-v3-svg.
    Does not accept image input.
    """

    @property
    def model_id(self) -> str:
        return "recraft-ai/recraft-v3-svg"

    @property
    def output_extension(self) -> str:
        return ".svg"

    @property
    def accepts_image(self) -> bool:
        return False

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        full_prompt = f"subject: {prompt}, styles: {STYLE_SUFFIX}"

        output = replicate.run(
            self.model_id,
            input={
                "prompt": full_prompt,
                "negative_prompt": NEGATIVE_PROMPT,
                "aspect_ratio": "1:1",
                "style": "line_art",
            },
        )

        return self._extract_bytes(output)
