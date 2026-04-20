import io
import os
from typing import Optional

import replicate

from app.services.models.base import ImageModel


class GrokVideoModel(ImageModel):
    """
    Text-to-video (and optional image-to-video) via xai/grok-imagine-video.
    Returns an MP4 video up to 8 seconds.
    """

    @property
    def model_id(self) -> str:
        return "xai/grok-imagine-video"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def accepts_image(self) -> bool:
        return False  # image is optional — no upload required

    @property
    def supports_duration(self) -> bool:
        return True

    def generate(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        duration: int = 5,
        aspect_ratio: str = "16:9",
        last_frame_bytes: Optional[bytes] = None,
        save_audio: bool = True,
    ) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        payload = {
            "prompt": prompt,
            "duration": min(duration, 8),
            "aspect_ratio": aspect_ratio,
        }
        if image_bytes is not None:
            payload["image"] = io.BytesIO(image_bytes)

        image_info = f"<{len(image_bytes)} bytes>" if image_bytes is not None else "none"
        print(f"[grok-video] request: prompt={prompt!r} image={image_info} duration={min(duration, 8)}s aspect={aspect_ratio}")

        output = replicate.run(self.model_id, input=payload)
        return self._extract_bytes(output)
