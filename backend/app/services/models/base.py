import requests
from abc import ABC, abstractmethod
from typing import Optional

# ---------------------------------------------------------------------------
# Shared style descriptors — used by all models.
# Recraft prepends "subject: {text}, styles: ...".
# Flux prepends "{text}, ..." (no subject label, since the image is the subject).
# ---------------------------------------------------------------------------
STYLE_SUFFIX = (
    "coloring book illustration, "
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
    "clean white background, "
    "strictly black and white only, "
    "use only pure black rgb(0,0,0) #000000 for outlines, "
    "use only pure white rgb(255,255,255) #ffffff for backgrounds and fill areas, "
    "no gray tones, no near-black colors, no colored fills, "
    "two-color palette black and white only"
)

NEGATIVE_PROMPT = (
    "filled shapes, solid black areas, silhouettes, "
    "shading, gradients, photorealistic, 3d, complex background, "
    "tiny details, intricate patterns, dense textures, "
    "book, open book, page border, frame, border, "
    "gray, grey, dark gray, near-black, colored fills, "
    "rgb(0,0,1), rgb(254,254,254), off-black, off-white"
)


class ImageModel(ABC):
    """
    Base class for all generation models.
    Subclasses implement generate() and declare their capabilities.
    """

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Replicate model identifier, e.g. 'recraft-ai/recraft-v3-svg'."""
        pass

    @property
    @abstractmethod
    def output_extension(self) -> str:
        """File extension for saved output, e.g. '.svg' or '.png'."""
        pass

    @property
    def accepts_image(self) -> bool:
        """Whether this model supports an image input (img2img)."""
        return False

    @property
    def is_multi_reference(self) -> bool:
        """True if this model takes all image_data as shared references and returns N outputs."""
        return False

    @property
    def supports_duration(self) -> bool:
        """Whether this model accepts a duration parameter."""
        return False

    @property
    def supports_lora(self) -> bool:
        """Whether this model accepts LoRA weights and related parameters."""
        return False

    @abstractmethod
    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        """Run the model and return raw image bytes."""
        pass

    def generate_multi(
        self,
        prompt: str,
        ref_images: list,
        num_outputs: int = 1,
        seed: Optional[int] = None,
    ) -> list:
        """Run the model with multiple shared reference images and return a list of image bytes."""
        raise NotImplementedError("This model does not support generate_multi()")

    def _extract_bytes(self, output) -> bytes:
        """Normalise the various output shapes the Replicate SDK can return."""
        if output is None:
            raise ValueError("Replicate returned no output")

        # replicate.helpers.FileOutput — has .read()
        if hasattr(output, "read"):
            data = output.read()
            return data if isinstance(data, bytes) else data.encode("utf-8")

        # URL string — download it
        if isinstance(output, str) and output.startswith("http"):
            resp = requests.get(output, timeout=60)
            resp.raise_for_status()
            return resp.content

        # Raw text (e.g. inline SVG)
        if isinstance(output, str):
            return output.encode("utf-8")

        # List / tuple — take the first item
        if isinstance(output, (list, tuple)) and output:
            return self._extract_bytes(output[0])

        raise ValueError(f"Unexpected Replicate output type: {type(output)}")
