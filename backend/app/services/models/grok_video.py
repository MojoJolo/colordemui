import io
import os
from typing import Optional

from app.services.models.base import ImageModel, is_video_bytes as _is_video


MAX_DURATION = 8


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
        return True  # optional image/video input; requires_image stays False

    @property
    def supports_duration(self) -> bool:
        return True

    @property
    def max_duration(self) -> int:
        return MAX_DURATION

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
            "duration": min(duration, MAX_DURATION),
            "aspect_ratio": aspect_ratio,
        }
        if image_bytes is not None:
            if _is_video(image_bytes):
                buf = io.BytesIO(image_bytes)
                buf.name = "input.mp4"
                payload["video"] = buf
            else:
                buf = io.BytesIO(image_bytes)
                buf.name = "image.png"
                payload["image"] = buf

        input_info = f"<video {len(image_bytes)} bytes>" if image_bytes is not None and _is_video(image_bytes) else (f"<image {len(image_bytes)} bytes>" if image_bytes is not None else "none")
        print(f"[grok-video] request: prompt={prompt!r} input={input_info} duration={min(duration, MAX_DURATION)}s aspect={aspect_ratio}")

        # Grok rejects Replicate Files API URLs regardless of MIME type —
        # pass all files inline as base64 data URIs to bypass file storage entirely.
        output = self._replicate_run(
            self.model_id,
            input=payload,
            **({"file_encoding_strategy": "base64"} if ("image" in payload or "video" in payload) else {}),
        )
        return self._extract_bytes(output)
