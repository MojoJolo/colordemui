"""
Concatenate multiple videos into a single MP4 using ffmpeg.

Clips produced by one workflow step share the same model, aspect ratio and
duration, so they are codec- and resolution-identical and can be joined with
the concat demuxer without re-encoding. Mixed sources (e.g. p-video clips
merged with grok-video clips) fall back to normalising every clip to the first
clip's format before concatenating.
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List

_DURATION_RE = re.compile(r"Duration: (\d+):(\d+):(\d+\.\d+)")
_VIDEO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Video: (\w+).*?, (\d+)x(\d+)")
_AUDIO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Audio: (\w+)")
_FPS_RE = re.compile(r", ([\d.]+) fps,")
_SAMPLE_RATE_RE = re.compile(r": Audio:.*?, (\d+) Hz")

# A merged file shorter than this fraction of the summed input durations means
# the stream copy silently dropped content — re-encode instead.
_DURATION_TOLERANCE = 0.95


def _ffmpeg_binary() -> str:
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


def _run(args: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True)


def _probe(path: Path) -> dict:
    """
    Read stream info from `ffmpeg -i`. ffprobe is not used because the
    imageio-ffmpeg fallback ships ffmpeg only.
    """
    # No output file, so ffmpeg exits non-zero after printing the stream info.
    proc = _run([_ffmpeg_binary(), "-hide_banner", "-i", str(path)])
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


def _signature(info: dict) -> tuple:
    """Stream properties that must match for a stream copy to produce a valid file."""
    return (
        info["video_codec"], info["width"], info["height"], info["fps"],
        info["audio_codec"], info["sample_rate"],
    )


def _decodes_cleanly(path: Path) -> bool:
    """Decode the merged file and reject it if ffmpeg reports any error."""
    proc = _run([_ffmpeg_binary(), "-hide_banner", "-v", "error", "-i", str(path), "-f", "null", "-"])
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
    return _run([
        _ffmpeg_binary(), "-y", "-hide_banner",
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

    args = [_ffmpeg_binary(), "-y", "-hide_banner", "-i", str(src)]
    if not _probe(src)["has_audio"]:
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

    proc = _run(args)
    if proc.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg could not normalise a clip:\n{proc.stderr[-2000:]}")


def _concat_reencode(paths: List[Path], out_path: Path, work_dir: Path) -> None:
    first = _probe(paths[0])
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

        probes = [_probe(p) for p in paths]
        expected = sum(p["duration"] for p in probes if p["duration"])
        out_path = work_dir / "merged.mp4"

        # Clips from one workflow step share a format and can be joined without
        # re-encoding. Anything else gets normalised first — a stream copy of
        # mismatched clips yields a file with broken timestamps.
        copy_ok = False
        if probes[0]["width"] and len({_signature(p) for p in probes}) == 1:
            proc = _concat_copy(paths, out_path, work_dir)
            merged_duration = _probe(out_path)["duration"] if out_path.exists() else None
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
