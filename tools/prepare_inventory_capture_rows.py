"""Create review candidates from the 2026-10-22 inventory screenshots.

No row produced here is an approved stock balance. Read the image before using
the recognized quantity, product name, variant, unit or location operationally.
"""

import hashlib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "context" / "inventory-count-review"


def in_band(tokens, x0, x1, y, tolerance=12):
    return " ".join(token["text"] for token in sorted(tokens, key=lambda token: (token["y"], token["x"]))
                    if x0 <= token["x"] < x1 and abs(token["y"] - y) <= tolerance).strip()


def main():
    evidence = json.loads((REVIEW / "capture-ocr.json").read_text(encoding="utf-8"))
    recognizer = RapidOCR(use_text_det=False, text_score=0.01)
    rows = []
    for screenshot in evidence["screenshots"]:
        path = Path(screenshot["source"])
        image = Image.open(path).convert("RGB")
        tokens = screenshot["tokens"]
        is_sublimation = "Sublim" in screenshot["area"]
        header = next((token for token in tokens if "STOK" in token["text"].upper() or "STOCKDISPONIBLE" in token["text"].upper()), None)
        if not header:
            continue
        stock_x, header_y = header["x"], header["y"]
        if is_sublimation:
            anchors = [token for token in tokens if 35 < token["x"] < 210 and token["y"] > header_y + 11
                       and token["text"].upper() not in {"TIPO", "COLOR", "TALLA"}]
        else:
            anchors = [token for token in tokens if 135 < token["x"] < 285 and token["y"] > header_y + 11
                       and token["text"].upper() != "TIPO"]
        image_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        for index, anchor in enumerate(anchors, 1):
            y = anchor["y"]
            left, right = (stock_x - 22, stock_x + 22) if is_sublimation else (stock_x - 48, stock_x + 48)
            crop = np.array(image.crop((max(0, left), max(0, y - 9), min(image.width, right), min(image.height, y + 9))))
            recognized, _ = recognizer(crop)
            stock_text = recognized[0][1].strip() if recognized else ""
            stock_confidence = float(recognized[0][2]) if recognized else 0.0
            normalized_stock = unicodedata.normalize("NFKC", stock_text)
            numeric = normalized_stock if re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?", normalized_stock) else ""
            if is_sublimation:
                row = {"type": anchor["text"], "detail": "", "color": in_band(tokens, 210, 325, y),
                       "size_or_characteristic": in_band(tokens, 325, stock_x - 26, y), "unit": ""}
            else:
                row = {"type": anchor["text"], "detail": in_band(tokens, 285, 475, y), "color": "",
                       "size_or_characteristic": in_band(tokens, 475, 615, y), "unit": in_band(tokens, 615, 760, y)}
            rows.append({"source": str(path), "source_sha256": image_hash, "area": screenshot["area"],
                         "row_in_screenshot": index, "image_y": y, **row,
                         "stock_ocr": stock_text, "stock_ocr_confidence": round(stock_confidence, 3),
                         "quantity_candidate": numeric, "review_status": "pending_visual_review"})
    REVIEW.mkdir(parents=True, exist_ok=True)
    (REVIEW / "capture-row-candidates.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Candidates: {len(rows)}; numeric OCR: {sum(bool(row['quantity_candidate']) for row in rows)}; visual review required: {len(rows)}")


if __name__ == "__main__":
    main()
