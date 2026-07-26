#!/usr/bin/env python3
"""Emit Traditional-Chinese PaddleOCR words as newline-delimited JSON.

This deliberately targets the stable PaddleOCR 2.x API. The TypeScript caller
reconstructs fixed-width lines from the word coordinates so the Gazette table
parser can continue to own lifecycle interpretation.
"""

from importlib.metadata import version
import json
import sys

from paddleocr import PaddleOCR


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: paddleocrTraditional.py IMAGE")

    ocr = PaddleOCR(lang="chinese_cht", use_angle_cls=True, show_log=False)
    pages = ocr.ocr(sys.argv[1], cls=True)
    print(
        json.dumps(
            {
                "type": "metadata",
                "engine": "PaddleOCR",
                "engineVersion": version("paddleocr"),
                "model": "chinese_cht",
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
