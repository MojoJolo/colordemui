from typing import Optional

from app.services.models.base import ImageModel
from app.services import text_overlay
from app.services.ffmpeg_util import sniff_media_kind


class TextOverlayModel(ImageModel):
    """
    Local text-overlay burn-in — not a Replicate model.

    It takes each file handed to it by the previous step (or the images picked
    on the step itself) and draws the step's resolved prompt over it as one big
    caption, optionally blurring the source first. The prompt goes through the
    usual placeholder resolution, so `{text}` pulls the caption from an earlier
    text step.
    """

    @property
    def model_id(self) -> str:
        return "local/ffmpeg-text-overlay"

    @property
    def output_extension(self) -> str:
        # Overridden per file by extension_for(); this is the fallback for
        # anything that is not recognisably a video.
        return ".png"

    @property
    def accepts_image(self) -> bool:
        return True

    @property
    def requires_image(self) -> bool:
        return True

    @property
    def is_processor(self) -> bool:
        return True

    @property
    def supports_text_overlay(self) -> bool:
        return True

    def extension_for(self, data: bytes) -> str:
        return ".mp4" if sniff_media_kind(data) == "video" else ".png"

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        return self.process(image_bytes, prompt)

    def process(
        self,
        data: Optional[bytes],
        text: str,
        overlay_text_size: int = 9,
        overlay_position: str = "center",
        overlay_blur: int = 0,
        overlay_color: str = "#ffffff",
    ) -> bytes:
        if not data:
            raise ValueError(
                "The text overlay step got no input. Put it after a step that "
                "produces an image or video, or pick one on the step itself."
            )
        return text_overlay.apply_text_overlay(
            data,
            text,
            text_size=overlay_text_size,
            position=overlay_position,
            blur=overlay_blur,
            color=overlay_color,
        )
