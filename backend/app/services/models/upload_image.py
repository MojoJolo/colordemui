from typing import Optional

from app.services.models.base import ImageModel


class UploadImageModel(ImageModel):
    """
    A workflow step that supplies uploaded images — not a Replicate model.

    It calls nothing; the images configured on the step become its output, so
    any later step can reference them the same way it references a generated
    image.
    """

    @property
    def model_id(self) -> str:
        return "local/upload-image"

    @property
    def output_extension(self) -> str:
        return ".png"  # uploads are normalised to PNG on the way in

    @property
    def is_upload(self) -> bool:
        return True

    def generate(self, prompt: str, image_bytes: Optional[bytes] = None) -> bytes:
        raise NotImplementedError("UploadImageModel supplies its configured images")
