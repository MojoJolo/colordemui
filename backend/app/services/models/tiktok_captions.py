import io
import os
from typing import Optional

import replicate as replicate_client

from app.services.models.base import ImageModel

_cached_versioned_id: Optional[str] = None


def _resolve_model_id(model_id: str) -> str:
    global _cached_versioned_id
    if _cached_versioned_id is None:
        model = replicate_client.models.get(model_id)
        version = model.latest_version
        _cached_versioned_id = f"{model_id}:{version.id}" if version else model_id
    return _cached_versioned_id


class TikTokCaptionsModel(ImageModel):
    """
    Video captioning via shreejalmaharjan-27/tiktok-short-captions.
    Takes a video and returns an MP4 with TikTok-style captions burned in.
    """

    @property
    def model_id(self) -> str:
        return "shreejalmaharjan-27/tiktok-short-captions"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def accepts_image(self) -> bool:
        return False

    @property
    def requires_image(self) -> bool:
        return False

    @property
    def supports_captions(self) -> bool:
        return True

    def generate(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        language: str = "english",
        caption_size: int = 40,
    ) -> bytes:
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        if not image_bytes:
            raise ValueError("TikTok captions model requires a video input")

        buf = io.BytesIO(image_bytes)
        buf.name = "input.mp4"

        payload = {
            "video": buf,
            "language": language,
            "caption_size": caption_size,
        }
        if prompt:
            payload["initial_prompt"] = prompt

        print(f"[tiktok-captions] language={language!r} caption_size={caption_size} initial_prompt={prompt!r}")

        output = self._replicate_run(
            _resolve_model_id(self.model_id),
            input=payload,
            file_encoding_strategy="base64",
        )
        return self._extract_bytes(output)
