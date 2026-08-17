// Output files come in three flavours: raster images, videos, and text from
// language models. Reference pickers only ever want raster images, so keep the
// classification in one place instead of re-listing extensions per form.

export function isVideoFile(filename) {
  return !!filename && /\.(mp4|webm|mov)$/i.test(filename);
}

export function isTextFile(filename) {
  return !!filename && /\.txt$/i.test(filename);
}

export function isVectorFile(filename) {
  return !!filename && /\.svg$/i.test(filename);
}

/** A finished output that can be handed to a model as a reference image. */
export function isPickableImage(img) {
  return (
    img.status === "done" &&
    !!img.url &&
    !isVideoFile(img.filename) &&
    !isVectorFile(img.filename) &&
    !isTextFile(img.filename)
  );
}
