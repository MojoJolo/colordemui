"""
Burn a large text caption onto a still image or a video, with an optional blur
applied to the source first so the caption stays readable.

The text is rendered to a transparent PNG with Pillow and then composited —
onto the still directly, or onto every video frame with ffmpeg's overlay
filter. ffmpeg's own drawtext filter would be the obvious route, but it needs a
libfreetype-enabled build, which the bundled imageio-ffmpeg binary is not.
"""

import io
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

from app.services.ffmpeg_util import (
    ffmpeg_binary,
    find_font,
    probe,
    run,
    sniff_media_kind,
    to_png_bytes,
)

POSITIONS = ("top", "center", "bottom")

# Fractions of the frame the caption block is allowed to use
_SAFE_WIDTH = 0.86
_SAFE_HEIGHT = 0.80
_LINE_SPACING = 1.22
_TOP_MARGIN = 0.07
_BOTTOM_MARGIN = 0.93

_MIN_FONT_PX = 12
_FALLBACK_GLYPH_RATIO = 0.55  # average glyph width as a fraction of font size

# Outline thickness as a fraction of the font size. Deliberately thin: enough to
# separate white text from a light frame, not enough to thicken the letterforms.
_OUTLINE_RATIO = 0.022
_MAX_OUTLINE_PERCENT = 12

DEFAULT_COLOR = "#ffffff"
DEFAULT_OUTLINE_COLOR = "#000000"
DEFAULT_OUTLINE_WIDTH = 100  # percent of the built-in (minimal) outline thickness


def _font(font_path: str, size: int):
    from PIL import ImageFont
    return ImageFont.truetype(font_path, size)


def _measure(font_path: str, size: int, line: str) -> float:
    """Width of `line` in pixels, measured with the font that will draw it."""
    try:
        return _font(font_path, size).getlength(line)
    except Exception:
        return len(line) * size * _FALLBACK_GLYPH_RATIO


def _wrap(text: str, font_path: str, size: int, max_width: float) -> List[str]:
    """Wrap on words, keeping any line breaks the caption already has."""
    lines: List[str] = []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if _measure(font_path, size, paragraph) <= max_width:
            lines.append(paragraph)
            continue

        current = ""
        for word in paragraph.split():
            candidate = f"{current} {word}".strip()
            if current and _measure(font_path, size, candidate) > max_width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
    return lines or [text.strip()]


def _layout(text: str, font_path: str, width: int, height: int, size_percent: int) -> Tuple[int, List[str]]:
    """
    Pick a font size and wrap the caption to fit. The requested size is the
    starting point: a long caption shrinks until the block fits the frame.
    """
    size = max(_MIN_FONT_PX, int(height * max(1, size_percent) / 100))
    max_width = width * _SAFE_WIDTH
    max_height = height * _SAFE_HEIGHT

    while size > _MIN_FONT_PX:
        lines = _wrap(text, font_path, size, max_width)
        widest = max((_measure(font_path, size, l) for l in lines), default=0)
        if len(lines) * size * _LINE_SPACING <= max_height and widest <= max_width:
            return size, lines
        size = int(size * 0.92)

    return _MIN_FONT_PX, _wrap(text, font_path, _MIN_FONT_PX, max_width)


def _outline_width(size: int, outline_percent: int) -> int:
    """
    Pixel thickness of the outline. `outline_percent` scales the built-in
    minimal outline: 100 keeps it, 0 turns it off, 200 doubles it.
    """
    outline_percent = max(0, min(400, outline_percent))
    if outline_percent == 0:
        return 0
    px = size * _OUTLINE_RATIO * outline_percent / 100
    return max(1, min(round(px), round(size * _MAX_OUTLINE_PERCENT / 100)))


def _render_text_layer(text: str, width: int, height: int, size_percent: int,
                       position: str, color: str,
                       outline_color: str = DEFAULT_OUTLINE_COLOR,
                       outline_width: int = DEFAULT_OUTLINE_WIDTH):
    """Draw the caption onto a transparent RGBA layer the size of the frame."""
    from PIL import Image, ImageDraw

    font_path = find_font()
    size, lines = _layout(text, font_path, width, height, size_percent)
    font = _font(font_path, size)

    line_h = size * _LINE_SPACING
    block_h = len(lines) * line_h
    if position == "top":
        first_y = height * _TOP_MARGIN
    elif position == "bottom":
        first_y = height * _BOTTOM_MARGIN - block_h
    else:
        first_y = (height - block_h) / 2
    first_y = max(0.0, first_y)

    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    stroke = _outline_width(size, outline_width)

    for i, line in enumerate(lines):
        cx = width / 2
        cy = first_y + i * line_h + line_h / 2
        # One pass: the text in its own colour, ringed by a thin opaque outline.
        # No drop shadow — the outline alone carries the contrast, which keeps
        # the letterforms crisp instead of muddy.
        draw.text((cx, cy), line, font=font, anchor="mm", fill=color,
                  stroke_width=stroke, stroke_fill=outline_color if stroke else None)

    print(f"[text-overlay] {len(lines)} line(s) @ {size}px · {position} · "
          f"{width}x{height} · outline {stroke}px · {Path(font_path).name}")
    return layer


def _blur_sigma(strength: int, width: int, height: int) -> Optional[float]:
    if strength <= 0:
        return None
    return max(1.0, min(width, height) * min(100, strength) / 100 * 0.05)


def _overlay_image(data: bytes, text: str, text_size: int, position: str,
                   blur: int, color: str, outline_color: str,
                   outline_width: int) -> bytes:
    from PIL import Image, ImageFilter

    png = to_png_bytes(data)
    base = Image.open(io.BytesIO(png)).convert("RGBA")
    sigma = _blur_sigma(blur, base.width, base.height)
    if sigma:
        base = base.filter(ImageFilter.GaussianBlur(radius=sigma))

    layer = _render_text_layer(text, base.width, base.height, text_size, position,
                               color, outline_color, outline_width)
    out = Image.alpha_composite(base, layer)

    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def _overlay_video(data: bytes, text: str, text_size: int, position: str,
                   blur: int, color: str, outline_color: str,
                   outline_width: int) -> bytes:
    with tempfile.TemporaryDirectory(prefix="text_overlay_") as tmp:
        work_dir = Path(tmp)
        src = work_dir / "input.mp4"
        src.write_bytes(data)

        info = probe(src)
        width, height = info["width"], info["height"]
        if not width or not height:
            raise RuntimeError(
                f"Could not read the input video's dimensions:\n{info['raw'][-2000:]}"
            )

        layer_path = work_dir / "overlay.png"
        _render_text_layer(text, width, height, text_size, position, color,
                           outline_color, outline_width).save(layer_path)

        sigma = _blur_sigma(blur, width, height)
        if sigma:
            graph = f"[0:v]gblur=sigma={sigma:.2f}[bg];[bg][1:v]overlay=0:0:format=auto[v]"
        else:
            graph = "[0:v][1:v]overlay=0:0:format=auto[v]"

        out = work_dir / "output.mp4"
        proc = run([
            ffmpeg_binary(), "-y", "-hide_banner",
            "-i", str(src), "-i", str(layer_path),
            "-filter_complex", graph,
            "-map", "[v]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-movflags", "+faststart",
            str(out),
        ])
        if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            raise RuntimeError(f"ffmpeg could not draw the text overlay:\n{proc.stderr[-2000:]}")

        return out.read_bytes()


def apply_text_overlay(
    data: bytes,
    text: str,
    text_size: int = 9,
    position: str = "center",
    blur: int = 0,
    color: str = DEFAULT_COLOR,
    outline_color: str = DEFAULT_OUTLINE_COLOR,
    outline_width: int = DEFAULT_OUTLINE_WIDTH,
) -> bytes:
    """
    Return `data` with `text` burned in. Video in, video out; image in, image
    out — the caller keeps whichever extension matches.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError(
            "The text overlay step has no text. Fill in its prompt, or point it "
            "at a text step with a {text} placeholder."
        )
    if position not in POSITIONS:
        position = "center"
    color = (color or "").strip() or DEFAULT_COLOR
    outline_color = (outline_color or "").strip() or DEFAULT_OUTLINE_COLOR
    outline_width = DEFAULT_OUTLINE_WIDTH if outline_width is None else int(outline_width)

    kind = sniff_media_kind(data)
    if kind == "video":
        return _overlay_video(data, text, text_size, position, blur, color,
                              outline_color, outline_width)
    if kind in ("image", "svg"):
        return _overlay_image(data, text, text_size, position, blur, color,
                              outline_color, outline_width)
    raise ValueError(f"The text overlay step needs an image or video input, got {kind}.")
