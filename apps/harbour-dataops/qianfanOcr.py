"""Transcribe one rendered page; stdout is one source-bound JSON result."""
import hashlib
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache/qianfan-ocr"
os.environ.setdefault("HF_HOME", str(CACHE / "huggingface"))
os.environ.setdefault("MIOPEN_USER_DB_PATH", str(CACHE / "miopen"))
os.environ.setdefault("MIOPEN_CUSTOM_CACHE_DIR", str(CACHE / "miopen-cache"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MODEL = "baidu/Qianfan-OCR"
REVISION = "623bf5d20d446abdb36606aa4547cd0c18886fe5"
PROMPT = "Parse this document to Markdown."
MAX_TOKENS = 8192


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: qianfanOcr.py IMAGE")
    import torch
    import transformers
    from PIL import Image
    from transformers import AutoModelForImageTextToText, AutoProcessor

    if not torch.cuda.is_available():
        raise RuntimeError("Qianfan OCR requires a CUDA/ROCm GPU visible to PyTorch.")
    path = Path(sys.argv[1])
    processor = AutoProcessor.from_pretrained(MODEL, revision=REVISION)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL, revision=REVISION, dtype=torch.float16,
        device_map={"": 0}, attn_implementation="eager",
    ).eval()
    with Image.open(path) as source:
        image = source.convert("RGB")
    inputs = processor.apply_chat_template(
        [{"role": "user", "content": [
            {"type": "image", "image": image},
            {"type": "text", "text": PROMPT},
        ]}],
        add_generation_prompt=True, tokenize=True, return_dict=True,
        return_tensors="pt", enable_thinking=False,
    ).to(model.device)
    for key, value in inputs.items():
        if torch.is_tensor(value) and value.is_floating_point():
            inputs[key] = value.to(torch.float16)
    torch.cuda.synchronize()
    start = time.monotonic()
    with torch.inference_mode():
        output = model.generate(
            **inputs, max_new_tokens=MAX_TOKENS, do_sample=False, use_cache=True,
        )
    torch.cuda.synchronize()
    generated = output[:, inputs["input_ids"].shape[1]:]
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    if generated.shape[1] >= MAX_TOKENS:
        raise RuntimeError("Qianfan OCR reached its token limit; refusing truncated evidence.")
    if not text.strip():
        raise RuntimeError("Qianfan OCR returned no recognised text.")
    print(json.dumps({
        "engine": "Qianfan-OCR", "engineVersion": transformers.__version__,
        "model": MODEL, "revision": REVISION, "prompt": PROMPT,
        "imageSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "dtype": "float16", "attention": "eager", "thinking": False,
        "torch": torch.__version__, "generatedTokens": generated.shape[1],
        "maxNewTokens": MAX_TOKENS, "hitTokenLimit": False,
        "inferenceSeconds": time.monotonic() - start, "text": text,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
