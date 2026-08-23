from typing import List, Optional

from app.services.models.base import ImageModel
from app.services import video_merge


class MergeMediaModel(ImageModel):
    """
    Local image + video concatenation — not a Replicate model.

    Where merge-videos joins whole steps in order, this step works from an
    explicit ordered list: each entry names one generated file (or an earlier
    step's output), how long a still is held, and whether a clip plays
    backwards. The same source can appear as many times as wanted, so a clip
    can run forwards and then reversed.
    """

    @property
    def model_id(self) -> str:
        return "local/ffmpeg-merge-media"

    @property
    def output_extension(self) -> str:
        return ".mp4"

    @property
    def is_merger(self) -> bool:
        return True

    @property
    def is_media_merger(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        raise NotImplementedError("MergeMediaModel uses merge_media()")

    def merge(self, clips: List[bytes]) -> bytes:
        return self.merge_media([{"data": c} for c in clips])

    def merge_media(self, items: List[dict]) -> bytes:
        kinds = sum(1 for i in items if i.get("reverse"))
        print(f"[merge-media] merging {len(items)} item(s), {kinds} reversed")
        return video_merge.merge_media(items)
