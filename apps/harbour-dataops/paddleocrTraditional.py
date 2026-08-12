#!/usr/bin/env python3
"""Emit PaddleOCR words as newline-delimited JSON.

This deliberately targets the stable PaddleOCR 2.x API. The caller reconstructs
lines from the word coordinates so its Gazette parser can own interpretation.
"""

from importlib.metadata import version
import json
import sys

from paddleocr import PaddleOCR


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: paddleocrTraditional.py IMAGE [LANGUAGE]")

    language = sys.argv[2] if len(sys.argv) == 3 else "chinese_cht"
    ocr = PaddleOCR(lang=language, use_angle_cls=True, show_log=False)
    pages = ocr.ocr(sys.argv[1], cls=True)
    print(
        json.dumps(
            {
                "type": "metadata",
                "engine": "PaddleOCR",
                "engineVersion": version("paddleocr"),
                "model": language,
            },
            ensure_ascii=False,
        )
    )
    for page in pages or []:
        for line in page or []:
            box, recognition = line
            text, confidence = recognition
            print(
                json.dumps(
                    {
                        "type": "word",
                        "left": min(point[0] for point in box),
                        "top": min(point[1] for point in box),
                        "text": text,
                        "confidence": confidence,
                    },
                    ensure_ascii=False,
                )
            )


if __name__ == "__main__":
    main()
