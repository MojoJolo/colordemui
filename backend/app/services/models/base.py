import threading
import time
from abc import ABC, abstractmethod
from typing import Optional

import httpx
import replicate
import requests

_rate_limit_lock = threading.Lock()
_last_call_time: float = 0.0
_CALL_DELAY_SECONDS: float = 5.0

# Video models can take minutes. The read timeout below only has to cover a
# single poll request, not the whole generation, because we do the waiting
# ourselves in _run_prediction().
_REPLICATE_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=300.0, pool=10.0)

# How long to keep polling one prediction before giving up, and how long to
# wait between polls.
_PREDICTION_DEADLINE_SECONDS: float = 1800.0
_POLL_INTERVAL_SECONDS: float = 3.0

# A dropped connection while polling is transient — the prediction keeps running
# on Replicate's side, so we reconnect rather than resubmit.
_TRANSIENT_ERRORS = (
    httpx.TimeoutException,
    httpx.NetworkError,
    httpx.RemoteProtocolError,
)
_MAX_CONSECUTIVE_POLL_FAILURES = 10

_TERMINAL_STATUSES = frozenset({"succeeded", "failed", "canceled"})

_client_lock = threading.Lock()
_client: Optional[replicate.Client] = None


def _get_client() -> replicate.Client:
    """
    Build the shared client lazily so REPLICATE_API_TOKEN is read at first use,
    not at import time — every model checks for the token itself and raises a
    friendlier error before it gets here.
    """
    global _client
    with _client_lock:
        if _client is None:
            _client = replicate.Client(timeout=_REPLICATE_TIMEOUT)
        return _client


def _throttle() -> None:
    """Space out prediction submissions. Polling is exempt."""
    global _last_call_time
    with _rate_limit_lock:
        elapsed = time.time() - _last_call_time
        if elapsed < _CALL_DELAY_SECONDS:
            time.sleep(_CALL_DELAY_SECONDS - elapsed)
        _last_call_time = time.time()


def _run_prediction(model_id: str, **kwargs):
    """
    Submit one prediction and poll it to completion.

    replicate.run() does the same thing, but a read timeout anywhere inside it
    surfaces as a failed generation with no way back — and retrying it would
    submit (and bill for) a second prediction. Here the prediction is created
    exactly once; only the polling GETs are retried.
    """
    client = _get_client()

    _throttle()
    prediction = client.predictions.create(model=model_id, **kwargs)

    started = time.monotonic()
    last_status = None
    consecutive_failures = 0

    while prediction.status not in _TERMINAL_STATUSES:
        elapsed = time.monotonic() - started
        if elapsed > _PREDICTION_DEADLINE_SECONDS:
            raise TimeoutError(
                f"{model_id} did not finish within "
                f"{_PREDICTION_DEADLINE_SECONDS / 60:.0f} minutes "
                f"(prediction {prediction.id}, last status {prediction.status})"
            )

        if prediction.status != last_status:
            print(f"[replicate] {model_id} {prediction.status} {elapsed:.0f}s")
            last_status = prediction.status

        time.sleep(_POLL_INTERVAL_SECONDS)
        try:
            prediction.reload()
            consecutive_failures = 0
        except _TRANSIENT_ERRORS as exc:
            consecutive_failures += 1
            if consecutive_failures >= _MAX_CONSECUTIVE_POLL_FAILURES:
                raise
            backoff = min(_POLL_INTERVAL_SECONDS * 2**consecutive_failures, 30.0)
            print(
                f"[replicate] {model_id} poll failed "
                f"({consecutive_failures}/{_MAX_CONSECUTIVE_POLL_FAILURES}): {exc} — "
                f"retrying in {backoff:.0f}s"
            )
            time.sleep(backoff)

    total = time.monotonic() - started
    print(f"[replicate] {model_id} {prediction.status} {total:.0f}s")

    if prediction.status != "succeeded":
        raise ValueError(
            f"{model_id} prediction {prediction.status}: "
            f"{prediction.error or 'no error detail'}"
        )
    return prediction.output


# Generous read timeout: a 10s 2K video is a large file, and the connection can
# stall partway through.
_DOWNLOAD_TIMEOUT = (10, 300)
_DOWNLOAD_ATTEMPTS = 3


def download_output(url: str) -> bytes:
    """Fetch a generated file, retrying transient network failures."""
    for attempt in range(1, _DOWNLOAD_ATTEMPTS + 1):
        try:
            resp = requests.get(url, timeout=_DOWNLOAD_TIMEOUT)
            resp.raise_for_status()
            return resp.content
        except (requests.Timeout, requests.ConnectionError) as exc:
            if attempt == _DOWNLOAD_ATTEMPTS:
                raise
            backoff = 2**attempt
            print(
                f"[replicate] download failed "
                f"({attempt}/{_DOWNLOAD_ATTEMPTS}): {exc} — retrying in {backoff}s"
            )
            time.sleep(backoff)


def is_video_bytes(data: Optional[bytes]) -> bool:
    """Sniff a video container, so image-only inputs can reject an upstream clip."""
    if not data:
        return False
    # MP4/MOV: 'ftyp' box at offset 4
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return True
    # WebM
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return True
    return False


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
    def requires_image(self) -> bool:
        """Whether an image input is mandatory (not just optional)."""
        return False

    @property
    def is_multi_reference(self) -> bool:
        """True if this model takes all image_data as shared references and returns N outputs."""
        return False

    @property
    def is_merger(self) -> bool:
        """True if this model combines the outputs of earlier steps into one file."""
        return False

    @property
    def is_text(self) -> bool:
        """True if this model returns text rather than an image or video."""
        return False

    @property
    def is_upload(self) -> bool:
        """True if this step supplies its configured images instead of generating any."""
        return False

    @property
    def is_media_merger(self) -> bool:
        """
        True if this merger works from an explicit ordered pick list of images
        and videos rather than from whole preceding steps.
        """
        return False

    @property
    def is_processor(self) -> bool:
        """True if this step transforms each file it is given instead of generating new ones."""
        return False

    @property
    def supports_text_overlay(self) -> bool:
        """Whether this step accepts the text-overlay parameters (size, position, blur, colour)."""
        return False

    @property
    def supports_duration(self) -> bool:
        """Whether this model accepts a duration parameter."""
        return False

    @property
    def supports_lora(self) -> bool:
        """Whether this model accepts LoRA weights and related parameters."""
        return False

    @property
    def supports_edit_preset(self) -> bool:
        """Whether this model accepts a replicate_weights edit preset."""
        return False

    @property
    def supports_aspect_ratio(self) -> bool:
        """Whether this model accepts an aspect_ratio parameter in generate()."""
        return False

    @property
    def supports_resolution(self) -> bool:
        """Whether this model accepts a resolution parameter in generate()."""
        return False

    @property
    def supports_reference_urls(self) -> bool:
        """
        Whether this model accepts reference_image_urls / reference_video_urls /
        reference_audio_urls lists of publicly reachable URLs.
        """
        return False

    @property
    def supports_captions(self) -> bool:
        """Whether this model accepts language and caption_size parameters in generate()."""
        return False

    @abstractmethod
    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        """Run the model and return raw image bytes."""
        pass

    def extension_for(self, data: bytes) -> str:
        """
        Extension for one produced file. Models whose output format depends on
        their input (a text overlay returns a video for a video) override this.
        """
        return self.output_extension

    def generate_multi(
        self,
        prompt: str,
        ref_images: list,
        num_outputs: int = 1,
        seed: Optional[int] = None,
    ) -> list:
        """Run the model with multiple shared reference images and return a list of image bytes."""
        raise NotImplementedError("This model does not support generate_multi()")

    @staticmethod
    def _replicate_run(model_id: str, **kwargs):
        return _run_prediction(model_id, **kwargs)

    def _extract_text(self, output) -> str:
        """
        Normalise a text response. Language models stream their answer as a
        sequence of string chunks, so every chunk has to be joined —
        _extract_bytes() would keep only the first one.
        """
        if output is None:
            raise ValueError("Replicate returned no output")

        if isinstance(output, str):
            return output

        # FileOutput — has .read()
        if hasattr(output, "read"):
            data = output.read()
            return data.decode("utf-8") if isinstance(data, bytes) else str(data)

        # Iterator / list of chunks — concatenate them all
        if isinstance(output, (list, tuple)) or hasattr(output, "__iter__"):
            chunks = [c if isinstance(c, str) else str(c) for c in output]
            if not chunks:
                raise ValueError("Replicate returned an empty response")
            return "".join(chunks)

        raise ValueError(f"Unexpected Replicate output type: {type(output)}")

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
            return download_output(output)

        # Raw text (e.g. inline SVG)
        if isinstance(output, str):
            return output.encode("utf-8")

        # List / tuple — take the first item
        if isinstance(output, (list, tuple)) and output:
            return self._extract_bytes(output[0])

        raise ValueError(f"Unexpected Replicate output type: {type(output)}")
