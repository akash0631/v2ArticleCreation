#!/usr/bin/env python3
"""
SRM image watermarker.

Reads JPEG/PNG bytes from stdin, draws a small white label in the bottom-right
corner containing every non-empty SRM field passed via --data (JSON), and writes
the resulting PNG bytes to stdout.

Called from Node via child_process.spawn — see Backend/src/utils/runPythonWatermark.ts.

Exit codes:
  0  success (PNG on stdout)
  1  invalid arguments / JSON parse error
  2  could not decode the input image
  3  unexpected error during drawing or encoding
"""

import argparse
import io
import json
import sys
import traceback
from PIL import Image, ImageDraw, ImageFont


def _build_lines(row):
    """Turn an SRM/article row (dict) into label lines, skipping empty/None values.

    Supports both the SRM-sync label fields and the post-approval article-master
    label fields. Article number lands at the top when present so it stands out
    in the bottom-right of the catalog photo.
    """
    lines = []

    def add(label, value, formatter=None):
        if value is None:
            return
        if isinstance(value, str) and not value.strip():
            return
        if formatter is not None:
            value = formatter(value)
        lines.append(f"{label}: {value}")

    # Article number (only present after SAP RFC succeeds)
    add("Article", row.get("article_number"))

    add("Presentation", row.get("presentation_no"))

    vendor_code = row.get("vendor_code")
    vendor_name = row.get("vendor_name")
    if vendor_code:
        vendor = vendor_code
        if vendor_name and str(vendor_name).strip():
            vendor = f"{vendor_code} / {vendor_name}"
        lines.append(f"Vendor: {vendor}")

    add("Division", row.get("division"))
    add("Sub-Div", row.get("sub_division"))
    add("Category", row.get("major_category"))
    add("Design", row.get("design_number"))
    add("MC", row.get("mc_code"))
    add("HSN", row.get("hsn_tax_code"))
    add("Fabric", row.get("fabric"))
    add("Colors", row.get("no_of_colors"))
    add("Season", row.get("season"))
    add("Year", row.get("year"))
    add("Rate", row.get("rate"), formatter=lambda v: f"Rs {v}")
    add("MRP", row.get("mrp"), formatter=lambda v: f"Rs {v}")
    # Some callers send `price` (SRM), others `rate` (DB). Only add Price if neither rate nor mrp already wrote a money line.
    if row.get("price") is not None and row.get("rate") is None and row.get("mrp") is None:
        add("Price", row.get("price"), formatter=lambda v: f"Rs {v}")

    # Date — keep just YYYY-MM-DD even if full ISO comes through
    date_raw = row.get("presentation_received_date")
    if date_raw:
        date_short = str(date_raw)[:10]
        if date_short:
            lines.append(f"Date: {date_short}")

    return lines


def _truncate_for_width(draw, text, font, max_width):
    """Add an ellipsis if `text` does not fit inside `max_width` pixels."""
    if draw.textlength(text, font=font) <= max_width:
        return text
    while text and draw.textlength(text + "...", font=font) > max_width:
        text = text[:-1]
    return text + "..." if text else "..."


def _load_font(size):
    """Try to load a TrueType font for nicer rendering; fall back to bitmap default."""
    candidates = [
        # Windows
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        # macOS
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _save(img, fmt):
    """Encode `img` to bytes in `fmt` ('jpeg' or 'png'). JPEG uses quality 90."""
    out = io.BytesIO()
    if fmt == "jpeg":
        # JPEG cannot store an alpha channel — make sure we are RGB.
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=90, optimize=True)
    else:
        img.save(out, format="PNG")
    return out.getvalue()


def watermark(image_bytes, row, fmt="png"):
    img = Image.open(io.BytesIO(image_bytes))
    # Auto-rotate per EXIF, then drop EXIF so output is uniform
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    img = img.convert("RGB")

    width, height = img.size

    lines = _build_lines(row)
    if not lines:
        # Nothing to draw — return the (re-encoded) image unchanged
        return _save(img, fmt)

    # Sizing: label width ≈ 22% of image width, clamped 220–360 px.
    pad_x = 10
    pad_y = 8
    line_h = 18
    font_size = 13
    box_w = max(220, min(360, int(width * 0.22)))
    box_h = len(lines) * line_h + 2 * pad_y

    margin = 16
    x0 = max(0, width - box_w - margin)
    y0 = max(0, height - box_h - margin)
    x1 = x0 + box_w
    y1 = y0 + box_h

    draw = ImageDraw.Draw(img)
    # White panel with a thin grey border
    draw.rectangle((x0, y0, x1, y1), fill="white", outline="#bbbbbb", width=1)

    font = _load_font(font_size)
    text_max_w = box_w - 2 * pad_x

    for i, line in enumerate(lines):
        fitted = _truncate_for_width(draw, line, font, text_max_w)
        draw.text((x0 + pad_x, y0 + pad_y + i * line_h), fitted, fill="#222222", font=font)

    return _save(img, fmt)


def main():
    parser = argparse.ArgumentParser(description="Stamp SRM/article data on an image.")
    parser.add_argument("--data", required=True, help="JSON-encoded row.")
    parser.add_argument(
        "--format",
        choices=("png", "jpeg"),
        default="png",
        help="Output encoding. Use 'jpeg' for article-master bucket uploads (small files); 'png' for SRM-time VLM input (lossless).",
    )
    try:
        args = parser.parse_args()
        row = json.loads(args.data) if args.data else {}
        if not isinstance(row, dict):
            raise ValueError("--data must be a JSON object")
    except (json.JSONDecodeError, ValueError) as err:
        sys.stderr.write(f"Bad --data argument: {err}\n")
        sys.exit(1)

    try:
        image_bytes = sys.stdin.buffer.read()
        if not image_bytes:
            sys.stderr.write("No image bytes received on stdin\n")
            sys.exit(2)
    except Exception as err:
        sys.stderr.write(f"Failed reading stdin: {err}\n")
        sys.exit(2)

    try:
        output_bytes = watermark(image_bytes, row, fmt=args.format)
    except Exception as err:
        sys.stderr.write(f"Watermark failed: {err}\n")
        traceback.print_exc(file=sys.stderr)
        sys.exit(3)

    sys.stdout.buffer.write(output_bytes)


if __name__ == "__main__":
    main()
