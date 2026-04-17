import io
from datetime import datetime, timezone

from PIL import Image

# Register HEIC/HEIF opener if pillow-heif is installed
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    print("[utils] pillow-heif registered OK")
except ImportError:
    print("[utils] WARNING: pillow-heif not installed — HEIC files will fail")

MAX_PIXELS = 1_000_000  # 1 megapixel


def utcnow() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def whiten_background(image_bytes: bytes, threshold: int = 210) -> bytes:
    """
    Replace near-white pixels with pure white.
    Converts to grayscale first so any off-white tint (warm/cool) is also caught.
    Pixels brighter than `threshold` become 255; darker pixels (the lines) are kept as-is.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.point(lambda p: 255 if p >= threshold else p)
    img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def normalize_image(image_bytes: bytes) -> bytes:
    """
    Accept any image format (including HEIC) and return PNG bytes
    scaled down to 1 MP if larger. Called on the reference image
    before it is stored and sent to the model.
    """
    print(f"[normalize_image] input size: {len(image_bytes)} bytes, "
          f"header: {image_bytes[:16].hex()}")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    print(f"[normalize_image] decoded OK: {img.width}x{img.height} {img.format}")

    total = img.width * img.height
    if total > MAX_PIXELS:
        scale = (MAX_PIXELS / total) ** 0.5
        img = img.resize(
            (int(img.width * scale), int(img.height * scale)),
            Image.LANCZOS,
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
