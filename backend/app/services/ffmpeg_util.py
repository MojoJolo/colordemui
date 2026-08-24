"""
Shared ffmpeg plumbing for the local (non-Replicate) workflow steps.

Locating the binary, probing a file's streams, sniffing what kind of media a
blob holds and finding a usable font all happen in more than one place, so they
live here rather than being re-implemented per step.
"""

import io
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional

_DURATION_RE = re.compile(r"Duration: (\d+):(\d+):(\d+\.\d+)")
_VIDEO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Video: (\w+).*?, (\d+)x(\d+)")
_AUDIO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Audio: (\w+)")
_FPS_RE = re.compile(r", ([\d.]+) fps,")
_SAMPLE_RATE_RE = re.compile(r": Audio:.*?, (\d+) Hz")

# Searched in order; the first one that exists wins. Debian's fonts-dejavu-core
# provides the first entry, which is what the backend image installs.
_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def ffmpeg_binary() -> str:
    """Locate ffmpeg: system install first, then the imageio-ffmpeg bundled binary."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError(
            "ffmpeg not found. Install it with 'apt-get install ffmpeg' "
            "or 'pip install imageio-ffmpeg'."
        ) from exc


def run(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True)


def probe(path: Path) -> dict:
    """
    Read stream info from `ffmpeg -i`. ffprobe is not used because the
    imageio-ffmpeg fallback ships ffmpeg only.
    """
    # No output file, so ffmpeg exits non-zero after printing the stream info.
    proc = run([ffmpeg_binary(), "-hide_banner", "-i", str(path)])
    text = proc.stderr

    audio = _AUDIO_STREAM_RE.search(text)
    info = {
        "video_codec": None,
        "width": None,
        "height": None,
        "fps": None,
        "audio_codec": audio.group(1) if audio else None,
        "sample_rate": None,
        "has_audio": bool(audio),
        "duration": None,
        "raw": text,
    }

    m = _VIDEO_STREAM_RE.search(text)
    if m:
        info["video_codec"] = m.group(1)
        info["width"], info["height"] = int(m.group(2)), int(m.group(3))
    m = _FPS_RE.search(text)
    if m:
        info["fps"] = float(m.group(1))
    m = _SAMPLE_RATE_RE.search(text)
    if m:
        info["sample_rate"] = int(m.group(1))
    m = _DURATION_RE.search(text)
    if m:
        h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        info["duration"] = h * 3600 + mn * 60 + s

    return info


def sniff_media_kind(data: Optional[bytes]) -> str:
    """
    Classify a blob as 'video', 'image', 'svg', 'text' or 'unknown' from its
    header. Workflow outputs carry no MIME type, so the bytes are all there is.
    """
    if not data:
        return "unknown"

    # MP4 / MOV / HEIC all carry an 'ftyp' box at offset 4 — the brand that
    # follows is what separates a clip from a still.
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12].lower()
        still_brands = (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"avif", b"avis")
        return "image" if brand in still_brands else "video"
    # Matroska / WebM
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "video"
    # AVI
    if data[:4] == b"RIFF" and data[8:12] == b"AVI ":
        return "video"

    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image"
    if data[:2] == b"\xff\xd8":
        return "image"
    if data[:4] == b"GIF8":
        return "image"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image"

    head = data[:512].lstrip()
    if head[:1] == b"<" and b"<svg" in data[:2048].lower():
        return "svg"

    try:
        data[:512].decode("utf-8")
        return "text"
    except UnicodeDecodeError:
        return "unknown"


def to_png_bytes(data: bytes) -> bytes:
    """
    Convert any still image — including SVG — to PNG, which is the one raster
    format every ffmpeg build here can read.
    """
    if sniff_media_kind(data) == "svg":
        import cairosvg
        return cairosvg.svg2png(bytestring=data, output_width=1080)

    from PIL import Image
    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def image_size(png_bytes: bytes) -> tuple:
    from PIL import Image
    img = Image.open(io.BytesIO(png_bytes))
    return img.width, img.height


def even(n: int) -> int:
    """libx264 with yuv420p needs even dimensions."""
    n = int(n)
    return n if n % 2 == 0 else n + 1


def find_font() -> str:
    """
    Locate a TrueType font for drawtext. TEXT_OVERLAY_FONT overrides the search
    when a specific face is wanted.
    """
    override = os.environ.get("TEXT_OVERLAY_FONT")
    if override and Path(override).exists():
        return override

    for candidate in _FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate

    for root in ("/usr/share/fonts", "/usr/local/share/fonts", str(Path.home() / ".fonts")):
        base = Path(root)
        if not base.exists():
            continue
        # Prefer a bold face — big overlay text reads better with heavier strokes
        fonts = sorted(base.rglob("*.ttf")) + sorted(base.rglob("*.otf"))
        bold = [f for f in fonts if "bold" in f.name.lower()]
        if bold:
            return str(bold[0])
        if fonts:
            return str(fonts[0])

    raise RuntimeError(
        "No TrueType font found for the text overlay. Install one "
        "(e.g. 'apt-get install fonts-dejavu-core') or set TEXT_OVERLAY_FONT "
        "to a .ttf path."
    )
