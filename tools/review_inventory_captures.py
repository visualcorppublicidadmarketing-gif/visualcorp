"""Extract read-only OCR evidence from inventory screenshots for manual reconciliation.

Requires rapidocr-onnxruntime in PYTHONPATH. This script never changes source images
or the operational inventory database.
"""

import json
from datetime import datetime
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR


SOURCE = Path(r"E:\VISUAL CORP\PRECIOS\Inventario")
DESTINATION = Path(__file__).resolve().parents[1] / "context" / "inventory-count-review" / "capture-ocr.json"


def main():
    engine = RapidOCR()
    results = []
    for path in sorted(SOURCE.rglob("*.png")):
        recognized, _ = engine(str(path))
        tokens = []
        for box, value, confidence in recognized or []:
            center_x = sum(point[0] for point in box) / len(box)
            center_y = sum(point[1] for point in box) / len(box)
            tokens.append({"x": round(center_x), "y": round(center_y), "text": value, "confidence": round(float(confidence), 3)})
        results.append({"source": str(path), "area": path.parent.name, "tokens": tokens})
        print(f"{path.parent.name}: {path.name}: {len(tokens)} OCR fragments", flush=True)
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps({"extracted_at": datetime.now().astimezone().isoformat(), "screenshots": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(results)} screenshots to {DESTINATION}")


if __name__ == "__main__":
    main()
