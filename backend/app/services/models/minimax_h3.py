from typing import Optional

from app.services.models.fal_base import FalModel

# ---------------------------------------------------------------------------
# Endpoint constants — kept flat and named so a schema correction is a one-line
# edit. Confirm these against the live schema at
# https://fal.ai/models/minimax/h3/text-to-video/api before trusting them.
# ---------------------------------------------------------------------------
_RESOLUTION = "2K"  # currently the only accepted value
_ALLOWED_DURATIONS = (5, 10, 15)
_ALLOWED_ASPECT_RATIOS = ("21:9", "16:9", "4:3", "1:1", "3:4", "9:16")
_DEFAULT_ASPECT_RATIO = "9:16"  # H3's own default is 16:9; the app is vertical-first
_MAX_PROMPT_CHARS = 7000


def _snap_duration(duration: int) -> int:
    """
    H3 renders 5-15s. The app's `duration` is a free-form int shared with every
    other video model, so snap it to the nearest value H3 accepts.

    If the live schema turns out to take any integer in [5, 15], drop the snap
    and clamp to the range instead.
    """
    try:
        value = int(duration)
    except (TypeError, ValueError):
        return _ALLOWED_DURATIONS[0]
    return min(_ALLOWED_DURATIONS, key=lambda allowed: abs(allowed - value))


class MinimaxH3TextToVideoModel(FalModel):
    """
    Text-to-video via fal.ai's minimax/h3/text-to-video.
    Returns a 2K MP4 with native stereo audio, 5-15 seconds at 24 FPS.
    """

    @property
    def model_id(self) -> str:
        return "minimax/h3/text-to-video"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def supports_duration(self) -> bool:
        return True

    @property
    def supports_aspect_ratio(self) -> bool:
        return True

    def generate(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        duration: int = 5,
        aspect_ratio: str = _DEFAULT_ASPECT_RATIO,
        last_frame_bytes: Optional[bytes] = None,
        save_audio: bool = True,
    ) -> bytes:
        # image_bytes / last_frame_bytes are ignored — this endpoint is text-only.
        # save_audio is ignored — H3 always returns native stereo audio.
        # All three are still accepted to match the positional signature that
        # run_job passes to every supports_duration model (see services/jobs.py).
        self._require_key()

        snapped = _snap_duration(duration)
        ratio = (
            aspect_ratio
            if aspect_ratio in _ALLOWED_ASPECT_RATIOS
            else _DEFAULT_ASPECT_RATIO
        )

        arguments = {
            "prompt": prompt[:_MAX_PROMPT_CHARS],
            "duration": snapped,
            "resolution": _RESOLUTION,
            "aspect_ratio": ratio,
        }

        print(
            f"[minimax-h3] request: prompt={prompt[:60]!r} "
            f"duration={snapped}s aspect={ratio} resolution={_RESOLUTION}"
        )

        result = self._fal_run(self.model_id, arguments)
        return self._extract_fal_bytes(result)
