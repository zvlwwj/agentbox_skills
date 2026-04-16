#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OPENCLAW_ROOT = Path.home() / ".openclaw"
OPENCLAW_CONFIG_PATH = OPENCLAW_ROOT / "openclaw.json"


def _detach_legacy_skill_entry() -> None:
    if not OPENCLAW_CONFIG_PATH.exists():
        return
    payload = json.loads(OPENCLAW_CONFIG_PATH.read_text())
    agents = (payload.get("agents") or {}).get("list") or []
    changed = False
    for agent in agents:
        skills = agent.get("skills")
        if isinstance(skills, list) and "agentbox-skills" in skills:
            agent["skills"] = [entry for entry in skills if entry != "agentbox-skills"]
            changed = True
    if changed:
        OPENCLAW_CONFIG_PATH.write_text(json.dumps(payload, indent=2))


def _ensure_plugin_allowlist() -> None:
    if not OPENCLAW_CONFIG_PATH.exists():
        return
    payload = json.loads(OPENCLAW_CONFIG_PATH.read_text())
    plugins = payload.setdefault("plugins", {})
    allow = plugins.get("allow")
    if not isinstance(allow, list):
        allow = []
    if "agentbox-skills" not in allow:
        allow.append("agentbox-skills")
    plugins["allow"] = allow
    OPENCLAW_CONFIG_PATH.write_text(json.dumps(payload, indent=2))


def _install_plugin() -> None:
    subprocess.run(["openclaw", "plugins", "install", "--force", str(REPO_ROOT)], check=True)
    subprocess.run(["openclaw", "plugins", "enable", "agentbox-skills"], check=True)


def _restart_gateway() -> None:
    subprocess.run(["openclaw", "gateway", "restart"], check=True)


def main() -> None:
    _detach_legacy_skill_entry()
    _install_plugin()
    _ensure_plugin_allowlist()
    _restart_gateway()
    print(f"Installed plugin from {REPO_ROOT}")
    print("Preserved runtime data, OpenClaw session history, and local workspace directories")
    print("Restarted OpenClaw gateway")


if __name__ == "__main__":
    main()
