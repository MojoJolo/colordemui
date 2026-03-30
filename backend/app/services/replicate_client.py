import os

import replicate
import requests


def generate(prompt: str) -> bytes:
    """
    Call the Replicate recraft-v3-svg model and return raw image bytes.
    Reads REPLICATE_API_TOKEN from the environment.
    """
    if not os.environ.get("REPLICATE_API_TOKEN"):
        raise ValueError(
            "REPLICATE_API_TOKEN is not set. "
            "Export it with: export REPLICATE_API_TOKEN=your_token_here"
        )

    full_prompt = (
        f"subject: {prompt}, styles: "
        "clean vector line art, "
        "stroke-only vector drawing, "
        "very thick bold outline strokes, "
        "uniform outline thickness, "
        "outline drawing only, "
        "open shapes with empty interiors for coloring, "
        "very large simple shapes, "
        "very minimal details, "
        "clear recognizable forms, "
        "simple familiar subject, "
        "single large subject centered, "
        "subject filling most of the page, "
        "very few secondary elements, "
        "very simple background context, "
        "background elements smaller than the main subject, "
        "balanced composition, "
        "clean white background"
    )

    negative_prompt = (
        "filled shapes, solid black areas, silhouettes, "
        "shading, gradients, photorealistic, 3d, complex background, "
        "tiny details, intricate patterns, dense textures, "
        "book, open book, page border, frame, border"
    )

    output = replicate.run(
        "recraft-ai/recraft-v3-svg",
        input={
            "prompt": full_prompt,
            "negative_prompt": negative_prompt,
            "aspect_ratio": "1:1",
            "style": "line_art",
        },
    )

    return _to_bytes(output)


def _to_bytes(output) -> bytes:
    """
    Normalise the various output shapes the Replicate SDK can return
    (FileOutput, URL string, raw SVG string, list) into raw bytes.
    """
    if output is None:
        raise ValueError("Replicate returned no output")

    # replicate.helpers.FileOutput — has a .read() method
    if hasattr(output, "read"):
        data = output.read()
        return data if isinstance(data, bytes) else data.encode("utf-8")

    # URL string → download it
    if isinstance(output, str) and output.startswith("http"):
        resp = requests.get(output, timeout=60)
        resp.raise_for_status()
        return resp.content

    # Raw SVG/text string returned directly
    if isinstance(output, str):
        return output.encode("utf-8")

    # List of outputs — take the first item
    if isinstance(output, (list, tuple)) and output:
        return _to_bytes(output[0])

    raise ValueError(f"Unexpected Replicate output type: {type(output)}")
