#!/usr/bin/env python3
"""Install a size guard in the local codex-acp 2.2.2 adapter used by Zed."""

import argparse
import json
from pathlib import Path
import shutil


IMPORT = 'import { guardZedAgentLocations } from "./zed-agent-location-guard.mjs";\n'
MARKER = "// src/tool-calls/AcpToolCallRenderer.ts\n"
NORMAL = '    if (facts4.report === "start" && rendered["title"] === void 0) rendered["title"] = "";'
PERMISSION = "    if (!this.capabilities.airClient) applyStandardFields(rendered, facts4.standard);\n    return rendered;"


def patch_bundle(source):
    if IMPORT in source:
        if source.count("guardZedAgentLocations(rendered);") != 2:
            raise ValueError("Incomplete guard installation; inspect the adapter before retrying")
        return source
    for expected in (MARKER, NORMAL, PERMISSION):
        if source.count(expected) != 1:
            raise ValueError("Adapter layout differs; refusing an unverified patch")
    return source.replace(MARKER, IMPORT + MARKER).replace(
        NORMAL, "    guardZedAgentLocations(rendered);\n" + NORMAL
    ).replace(PERMISSION, PERMISSION.replace(
        "    return rendered;", "    guardZedAgentLocations(rendered);\n    return rendered;"
    ))


def main():
    default = Path.home() / ".local/share/zed/external_agents/registry/npx/codex-acp/node_modules/@agentclientprotocol/codex-acp"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter", type=Path, default=default)
    parser.add_argument("--apply", action="store_true", help="write the verified patch and preserve the original bundle")
    args = parser.parse_args()
    metadata = json.loads((args.adapter / "package.json").read_text())
    if metadata.get("name") != "@agentclientprotocol/codex-acp" or metadata.get("version") != "2.2.2":
        parser.error("Only codex-acp 2.2.2 has been verified; inspect newer versions before patching")
    bundle = args.adapter / "dist/index.js"
    original = bundle.read_text()
    patched = patch_bundle(original)
    if not args.apply:
        print(f"Verified guard patch for {bundle}; use --apply to install")
        return
    backup = bundle.with_name("index.js.before-location-guard")
    if not backup.exists():
        if IMPORT in original:
            raise ValueError("Patched bundle has no original backup")
        shutil.copy2(bundle, backup)
    helper = Path(__file__).with_name("zed-agent-location-guard.mjs")
    helper_target = bundle.with_name(helper.name)
    helper_pending = helper_target.with_suffix(".mjs.tmp")
    shutil.copy2(helper, helper_pending)
    helper_pending.replace(helper_target)
    pending = bundle.with_suffix(".js.tmp")
    pending.write_text(patched)
    pending.chmod(bundle.stat().st_mode & 0o777)
    pending.replace(bundle)
    print(f"Installed 4 MiB location guard in {bundle}; restart the Zed agent to activate")


if __name__ == "__main__":
    main()
