import os
from typing import Any, Optional

import fal_client
import requests

from app.services.models.base import ImageModel

# A 2K video with audio is far larger than anything the Replicate path downloads,
# so fal gets its own generous, streamed download rather than reusing
# ImageModel._extract_bytes() — that helper caps out at a 60s non-streamed GET.
_DOWNLOAD_TIMEOUT_SECONDS = 300
_DOWNLOAD_CHUNK_SIZE = 1 << 20  # 1 MiB

# Keys fal endpoints wrap their generated asset in, in the order we look for them.
_MEDIA_KEYS = ("video", "videos", "audio", "image", "images", "file", "files")


class FalModel(ImageModel):
    """
    Base class for models served by fal.ai.

    The Replicate helpers in base.py are deliberately left alone: fal calls skip
    the global 5s throttle there, which exists for Replicate's rate limits and
    should neither delay fal calls nor be delayed by them.
    """

    @staticmethod
    def _require_key() -> None:
        """fal_client reads FAL_KEY from the environment itself, same as the
        replicate SDK — this only turns a missing key into a readable error."""
        if not os.environ.get("FAL_KEY"):
            raise ValueError(
                "FAL_KEY is not set. Export it with: export FAL_KEY=your_key_here"
            )

    @staticmethod
    def _fal_run(app_id: str, arguments: dict) -> Any:
        """Submit to fal's queue and block until the result is ready."""
        return fal_client.subscribe(app_id, arguments=arguments, with_logs=False)

    @classmethod
    def _find_media_url(cls, node: Any) -> Optional[str]:
        """
        Walk a fal result for the generated asset's URL.

        fal wraps outputs in a File object — e.g. {"video": {"url": ...}} — and
        some endpoints return a list of them instead of a single one.
        """
        if isinstance(node, str):
            return node if node.startswith("http") else None

        if isinstance(node, (list, tuple)):
            for item in node:
                found = cls._find_media_url(item)
                if found:
                    return found
            return None

        if isinstance(node, dict):
            if isinstance(node.get("url"), str):
                return node["url"]
            for key in _MEDIA_KEYS:
                if key in node:
                    found = cls._find_media_url(node[key])
                    if found:
                        return found

        return None

    def _extract_fal_bytes(self, result: Any) -> bytes:
        """Resolve a fal result to the asset's raw bytes."""
        url = self._find_media_url(result)
        if not url:
            shape = list(result.keys()) if isinstance(result, dict) else type(result).__name__
            raise ValueError(f"fal returned no media URL — result shape: {shape}")

        resp = requests.get(url, stream=True, timeout=_DOWNLOAD_TIMEOUT_SECONDS)
        resp.raise_for_status()

        buf = bytearray()
        for chunk in resp.iter_content(chunk_size=_DOWNLOAD_CHUNK_SIZE):
            if chunk:
                buf.extend(chunk)
        return bytes(buf)
