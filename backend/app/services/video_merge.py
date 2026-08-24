"""
Concatenate videos — and, for the media merger, stills — into a single MP4
using ffmpeg.

Clips produced by one workflow step share the same model, aspect ratio and
duration, so they are codec- and resolution-identical and can be joined with
the concat demuxer without re-encoding. Mixed sources (e.g. p-video clips
merged with grok-video clips, or a still image dropped between two clips) fall
back to normalising every clip to a common format before concatenating.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import List

from app.services.ffmpeg_util import (
    even,
    ffmpeg_binary,
    image_size,
    probe,
    run,
    sniff_media_kind,
    to_png_bytes,
)

# A merged file shorter than this fraction of the summed input durations means
# the stream copy silently dropped content — re-encode instead.
_DURATION_TOLERANCE = 0.95

# Fallbacks for a merge that holds only still images and therefore has no clip
# to copy a frame rate or sample rate from.
_STILL_FPS = 30
_STILL_SAMPLE_RATE = 44100
_DEFAULT_STILL_SECONDS = 3.0



def _signature(info: dict) -> tuple:
    """Stream properties that must match for a stream copy to produce a valid file."""
    return (
        info["video_codec"], info["width"], info["height"], info["fps"],
        info["audio_codec"], info["sample_rate"],
    )


def _decodes_cleanly(path: Path) -> bool:
    """Decode the merged file and reject it if ffmpeg reports any error."""
    proc = run([ffmpeg_binary(), "-hide_banner", "-v", "error", "-i", str(path), "-f", "null", "-"])
    return proc.returncode == 0 and not proc.stderr.strip()


def _write_concat_list(paths: List[Path], list_path: Path) -> None:
    lines = []
    for p in paths:
        # concat demuxer escapes a single quote inside a quoted path as '\''
        escaped = str(p.resolve()).replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines) + "\n")


def _concat_copy(paths: List[Path], out_path: Path, work_dir: Path) -> subprocess.CompletedProcess:
    list_path = work_dir / "concat.txt"
    _write_concat_list(paths, list_path)
    return run([
        ffmpeg_binary(), "-y", "-hide_banner",
        "-f", "concat", "-safe", "0", "-i", str(list_path),
        "-c", "copy", "-movflags", "+faststart",
        str(out_path),
    ])


def _normalize(src: Path, dest: Path, target: dict) -> None:
    """Re-encode one clip to the target format, adding silence when it has no audio track."""
    width, height, fps = target["width"], target["height"], target["fps"]
    sample_rate = target["sample_rate"] or 44100
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}"
    )

    args = [ffmpeg_binary(), "-y", "-hide_banner", "-i", str(src)]
    if not probe(src)["has_audio"]:
        args += ["-f", "lavfi", "-i", f"anullsrc=r={sample_rate}:cl=stereo",
                 "-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    else:
        args += ["-map", "0:v:0", "-map", "0:a:0"]
    args += [
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", str(sample_rate), "-ac", "2",
        "-video_track_timescale", "90000",
        str(dest),
    ]

    proc = run(args)
    if proc.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg could not normalise a clip:\n{proc.stderr[-2000:]}")


def _concat_reencode(paths: List[Path], out_path: Path, work_dir: Path) -> None:
    first = probe(paths[0])
    if not first["width"] or not first["height"]:
        raise RuntimeError(
            f"Could not read video dimensions from the first clip:\n{first['raw'][-2000:]}"
        )
    target = {
        "width": first["width"],
        "height": first["height"],
        "fps": first["fps"] or 30,
        "sample_rate": first["sample_rate"] or 44100,
    }

    normalized = []
    for i, path in enumerate(paths):
        dest = work_dir / f"norm_{i:03d}.mp4"
        _normalize(path, dest, target)
        normalized.append(dest)

    proc = _concat_copy(normalized, out_path, work_dir)
    if proc.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"ffmpeg could not merge the clips:\n{proc.stderr[-2000:]}")


def merge_videos(clips: List[bytes]) -> bytes:
    """
    Concatenate `clips` (raw MP4 bytes, in playback order) into one MP4.
    Returns the merged file's bytes.
    """
    if len(clips) < 2:
        raise ValueError(f"Merging needs at least 2 videos, got {len(clips)}.")
    for i, blob in enumerate(clips):
        if not blob:
            raise ValueError(f"Video {i + 1} is empty and cannot be merged.")

    with tempfile.TemporaryDirectory(prefix="merge_videos_") as tmp:
        work_dir = Path(tmp)
        paths = []
        for i, blob in enumerate(clips):
            path = work_dir / f"clip_{i:03d}.mp4"
            path.write_bytes(blob)
            paths.append(path)

        probes = [probe(p) for p in paths]
        expected = sum(p["duration"] for p in probes if p["duration"])
        out_path = work_dir / "merged.mp4"

        # Clips from one workflow step share a format and can be joined without
        # re-encoding. Anything else gets normalised first — a stream copy of
        # mismatched clips yields a file with broken timestamps.
        copy_ok = False
        if probes[0]["width"] and len({_signature(p) for p in probes}) == 1:
            proc = _concat_copy(paths, out_path, work_dir)
            merged_duration = probe(out_path)["duration"] if out_path.exists() else None
            copy_ok = (
                proc.returncode == 0
                and out_path.exists()
                and out_path.stat().st_size > 0
                and (not expected or (merged_duration or 0) >= expected * _DURATION_TOLERANCE)
                and _decodes_cleanly(out_path)
            )

        if not copy_ok:
            print("[merge-videos] clips differ in format, re-encoding to a common format")
            out_path.unlink(missing_ok=True)
            _concat_reencode(paths, out_path, work_dir)

        return out_path.read_bytes()


# ---------------------------------------------------------------------------
# Mixed media merge — videos and stills, in a caller-defined order
# ---------------------------------------------------------------------------

def _still_to_clip(png_path: Path, dest: Path, seconds: float, target: dict) -> None:
    """Turn a still into a silent-but-audio-carrying clip of the target format."""
    width, height, fps = target["width"], target["height"], target["fps"]
    sample_rate = target["sample_rate"]
    seconds = max(0.2, float(seconds))
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}"
    )
    proc = run([
        ffmpeg_binary(), "-y", "-hide_banner",
        "-loop", "1", "-t", f"{seconds:.3f}", "-i", str(png_path),
        "-f", "lavfi", "-t", f"{seconds:.3f}", "-i", f"anullsrc=r={sample_rate}:cl=stereo",
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", str(sample_rate), "-ac", "2",
        "-video_track_timescale", "90000", "-shortest",
        str(dest),
    ])
    if proc.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg could not turn an image into a clip:\n{proc.stderr[-2000:]}")


def _video_to_clip(src_path: Path, dest: Path, target: dict, reverse: bool) -> None:
    """
    Re-encode a clip to the target format, optionally played backwards.

    `reverse` buffers the whole clip in memory, which is fine for the few-second
    clips these workflows produce.
    """
    width, height, fps = target["width"], target["height"], target["fps"]
    sample_rate = target["sample_rate"]
    chain = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
        "setsar=1",
        f"fps={fps}",
    ]
    if reverse:
        chain.append("reverse")

    has_audio = probe(src_path)["has_audio"]
    args = [ffmpeg_binary(), "-y", "-hide_banner", "-i", str(src_path)]
    if has_audio:
        args += ["-map", "0:v:0", "-map", "0:a:0"]
        if reverse:
            args += ["-af", "areverse"]
    else:
        # Every clip needs an audio track, otherwise the concat demuxer drops it
        # for the whole merge.
        args += ["-f", "lavfi", "-i", f"anullsrc=r={sample_rate}:cl=stereo",
                 "-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    args += [
        "-vf", ",".join(chain),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", str(sample_rate), "-ac", "2",
        "-video_track_timescale", "90000",
        str(dest),
    ]
    proc = run(args)
    if proc.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg could not prepare a clip for merging:\n{proc.stderr[-2000:]}")


def _media_target(prepared: List[dict]) -> dict:
    """
    Pick the output format: the first video's, so clips are not rescaled when
    only stills are mixed in. An all-stills merge falls back to the first
    image's size.
    """
    for item in prepared:
        if item["kind"] == "video":
            info = item["probe"]
            if info["width"] and info["height"]:
                return {
                    "width": even(info["width"]),
                    "height": even(info["height"]),
                    "fps": info["fps"] or _STILL_FPS,
                    "sample_rate": info["sample_rate"] or _STILL_SAMPLE_RATE,
                }

    for item in prepared:
        if item["kind"] == "image":
            w, h = image_size(item["path"].read_bytes())
            return {
                "width": even(w),
                "height": even(h),
                "fps": _STILL_FPS,
                "sample_rate": _STILL_SAMPLE_RATE,
            }

    raise ValueError("Nothing to merge — no readable image or video in the selection.")


def merge_media(items: List[dict]) -> bytes:
    """
    Concatenate a caller-ordered mix of videos and stills into one MP4.

    Each item is a dict of:
      data      raw bytes of a video or still image (required)
      reverse   play a video backwards (ignored for stills)
      seconds   how long a still is held on screen
      label     name used in error messages

    The same source may appear more than once — for example forwards, then
    reversed — because each entry is prepared independently.
    """
    if len(items) < 2:
        raise ValueError(f"Merging needs at least 2 items, got {len(items)}.")

    with tempfile.TemporaryDirectory(prefix="merge_media_") as tmp:
        work_dir = Path(tmp)

        prepared: List[dict] = []
        for i, item in enumerate(items):
            label = item.get("label") or f"Item {i + 1}"
            data = item.get("data")
            if not data:
                raise ValueError(f"{label} is empty and cannot be merged.")

            kind = sniff_media_kind(data)
            if kind == "video":
                path = work_dir / f"src_{i:03d}.mp4"
                path.write_bytes(data)
                prepared.append({
                    "kind": "video",
                    "path": path,
                    "probe": probe(path),
                    "reverse": bool(item.get("reverse")),
                    "label": label,
                })
            elif kind in ("image", "svg"):
                path = work_dir / f"src_{i:03d}.png"
                try:
                    path.write_bytes(to_png_bytes(data))
                except Exception as exc:
                    raise ValueError(f"{label} could not be read as an image: {exc}") from exc
                prepared.append({
                    "kind": "image",
                    "path": path,
                    "seconds": float(item.get("seconds") or _DEFAULT_STILL_SECONDS),
                    "label": label,
                })
            else:
                raise ValueError(
                    f"{label} is neither a video nor an image ({kind}) and cannot be merged."
                )

        target = _media_target(prepared)

        clips = []
        for i, item in enumerate(prepared):
            dest = work_dir / f"norm_{i:03d}.mp4"
            if item["kind"] == "video":
                _video_to_clip(item["path"], dest, target, item["reverse"])
            else:
                _still_to_clip(item["path"], dest, item["seconds"], target)
            clips.append(dest)

        out_path = work_dir / "merged.mp4"
        proc = _concat_copy(clips, out_path, work_dir)
        if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
            raise RuntimeError(f"ffmpeg could not merge the selection:\n{proc.stderr[-2000:]}")

        return out_path.read_bytes()

