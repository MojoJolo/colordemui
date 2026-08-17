import io
import os
from typing import List, Optional

from app.services.models.base import ImageModel


def _clean_urls(urls: Optional[List[str]]) -> List[str]:
    """Drop blank entries and surrounding whitespace from a reference URL list."""
    return [u.strip() for u in (urls or []) if u and u.strip()]


class MiniMaxH3Model(ImageModel):
    """
    Text-to-video (and optional image-to-video) via minimax/h3.
    Returns an MP4 video.

    Verified input schema — every key below comes from a known-good request:

        {"ratio": "16:9", "prompt": "...", "duration": 5, "resolution": "2K",
         "first_frame_image": "https://...png", "reference_audio_urls": [],
         "reference_image_urls": [], "reference_video_urls": []}

    Note the aspect ratio is called `ratio` here, not `aspect_ratio` as in the
    rest of this codebase — the mapping happens in generate().
    """

    @property
    def model_id(self) -> str:
        return "minimax/h3"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def accepts_image(self) -> bool:
        return False  # first frame is optional — no upload required

    @property
    def supports_duration(self) -> bool:
        return True

    @property
    def supports_aspect_ratio(self) -> bool:
        return True

    @property
    def supports_resolution(self) -> bool:
        return True

    @property
    def supports_reference_urls(self) -> bool:
        return True

    def generate(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        duration: int = 5,
        aspect_ratio: str = "16:9",
        last_frame_bytes: Optional[bytes] = None,
        save_audio: bool = True,
        resolution: str = "2K",
        reference_image_urls: Optional[List[str]] = None,
        reference_video_urls: Optional[List[str]] = None,
        reference_audio_urls: Optional[List[str]] = None,
    ) -> bytes:
        # last_frame_bytes and save_audio are accepted only to match the
        # positional signature jobs.py uses for every supports_duration model.
        # h3 has no equivalent inputs, so they are deliberately ignored.
        if not os.environ.get("REPLICATE_API_TOKEN"):
            raise ValueError(
                "REPLICATE_API_TOKEN is not set. "
                "Export it with: export REPLICATE_API_TOKEN=your_token_here"
            )

        ref_images = _clean_urls(reference_image_urls)
        ref_videos = _clean_urls(reference_video_urls)
        ref_audios = _clean_urls(reference_audio_urls)

        payload = {
            "prompt": prompt,
            "ratio": aspect_ratio,
            "duration": duration,
            "resolution": resolution,
            "reference_image_urls": ref_images,
            "reference_video_urls": ref_videos,
            "reference_audio_urls": ref_audios,
        }
        if image_bytes is not None:
            payload["first_frame_image"] = io.BytesIO(image_bytes)

        image_info = f"<{len(image_bytes)} bytes>" if image_bytes is not None else "none"
        print(
            f"[minimax-h3] request: prompt={prompt!r} first_frame={image_info} "
            f"duration={duration}s ratio={aspect_ratio} resolution={resolution} "
            f"refs=(img {len(ref_images)}, video {len(ref_videos)}, audio {len(ref_audios)})"
        )

        output = self._replicate_run(self.model_id, input=payload)
        return self._extract_bytes(output)
