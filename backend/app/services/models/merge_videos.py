from typing import List, Optional

from app.services.models.base import ImageModel
from app.services import video_merge


class MergeVideosModel(ImageModel):
    """
    Local video concatenation — not a Replicate model.

    Used as a workflow step that joins the videos produced by earlier steps
    into a single MP4, which then flows on to any following step.
    """

    @property
    def model_id(self) -> str:
        return "local/ffmpeg-concat"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def is_merger(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        raise NotImplementedError("MergeVideosModel uses merge()")

    def merge(self, clips: List[bytes]) -> bytes:
        print(f"[merge-videos] merging {len(clips)} clip(s)")
        return video_merge.merge_videos(clips)
