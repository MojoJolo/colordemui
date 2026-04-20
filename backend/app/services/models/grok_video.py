import io
import os
from typing import Optional

import replicate

from app.services.models.base import ImageModel


def _is_video(data: bytes) -> bool:
    # MP4/MOV: 'ftyp' box at offset 4
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return True
    # WebM
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return True
    return False


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
            buf = io.BytesIO(image_bytes)
            if _is_video(image_bytes):
                buf.name = "input.mp4"
                payload["video"] = buf
            else:
                buf.name = "image.png"
                payload["image"] = buf

        input_info = f"<video {len(image_bytes)} bytes>" if image_bytes is not None and _is_video(image_bytes) else (f"<image {len(image_bytes)} bytes>" if image_bytes is not None else "none")
        print(f"[grok-video] request: prompt={prompt!r} input={input_info} duration={min(duration, 8)}s aspect={aspect_ratio}")

        # The grok model rejects Replicate Files API URLs even with correct MIME type —
        # pass video inline as a base64 data URI to bypass file storage entirely.
        output = replicate.run(
            self.model_id,
            input=payload,
            **({"file_encoding_strategy": "base64"} if "video" in payload else {}),
        )
        return self._extract_bytes(output)
