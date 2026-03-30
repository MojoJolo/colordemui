import io
from pathlib import Path
from typing import List

import cairosvg
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def _to_image_reader(image_path: Path) -> ImageReader:
    """Convert any supported image file to a ReportLab ImageReader."""
    ext = image_path.suffix.lower()
    if ext == ".svg":
        png_bytes = cairosvg.svg2png(url=str(image_path.resolve()), scale=2)
        return ImageReader(io.BytesIO(png_bytes))
    else:
        # PNG, WebP, JPEG, etc. — normalise to PNG via Pillow
        pil_img = Image.open(image_path).convert("RGBA")
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)
        return ImageReader(buf)


def generate_pdf(image_paths: List[Path], output_path: Path) -> None:
    """
    One image per page, US Letter portrait, centred with 1-inch margins.
    Handles both SVG (via cairosvg) and raster images (via Pillow).
    """
    page_w, page_h = letter
    margin = 1 * inch
    avail_w = page_w - 2 * margin
    avail_h = page_h - 2 * margin

    c = canvas.Canvas(str(output_path), pagesize=letter)

    for image_path in image_paths:
        try:
            img = _to_image_reader(image_path)
            img_w, img_h = img.getSize()

            scale = min(avail_w / img_w, avail_h / img_h)
            draw_w = img_w * scale
            draw_h = img_h * scale
            x = (page_w - draw_w) / 2
            y = (page_h - draw_h) / 2

            c.drawImage(img, x, y, width=draw_w, height=draw_h, mask="auto")

        except Exception as exc:
            print(f"Warning: could not render {image_path.name}: {exc}")

        c.showPage()

    c.save()
