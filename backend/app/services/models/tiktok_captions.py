import io
import os
import subprocess
import tempfile
from typing import Optional

from app.services.models.base import ImageModel


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
        save_audio: bool = True,
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

        print(f"[tiktok-captions] language={language!r} caption_size={caption_size} save_audio={save_audio} initial_prompt={prompt!r}")

        output = self._replicate_run(
            self.model_id,
            input=payload,
            file_encoding_strategy="base64",
        )
        result_bytes = self._extract_bytes(output)

        if not save_audio:
            result_bytes = self._strip_audio(result_bytes)

        return result_bytes

    @staticmethod
    def _strip_audio(video_bytes: bytes) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in:
            tmp_in.write(video_bytes)
            tmp_in_path = tmp_in.name
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_out:
            tmp_out_path = tmp_out.name
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in_path, "-an", "-c:v", "copy", tmp_out_path],
                check=True,
                capture_output=True,
            )
            return open(tmp_out_path, "rb").read()
        finally:
            os.unlink(tmp_in_path)
            os.unlink(tmp_out_path)
