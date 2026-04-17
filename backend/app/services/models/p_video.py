import io
import os
from typing import Optional

import replicate

from app.services.models.base import ImageModel


class PVideoModel(ImageModel):
    """
    Image-to-video generation via prunaai/p-video.
    Takes an existing image and a text prompt; returns an MP4 video.
    """

    @property
    def model_id(self) -> str:
        return "prunaai/p-video"

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
        aspect_ratio: str = "9:16",
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
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "save_audio": save_audio,
            "disable_safety_filter": True,
        }
        if image_bytes is not None:
            payload["image"] = io.BytesIO(image_bytes)
        if last_frame_bytes is not None:
            payload["last_frame_image"] = io.BytesIO(last_frame_bytes)

        image_info = f"<{len(image_bytes)} bytes>" if image_bytes is not None else "none"
        last_info = f"<{len(last_frame_bytes)} bytes>" if last_frame_bytes is not None else "none"
        print(f"[p-video] request: prompt={prompt!r} image={image_info} last_frame={last_info}")

        output = replicate.run(self.model_id, input=payload)
        return self._extract_bytes(output)
