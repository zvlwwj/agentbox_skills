from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OPENCLAW_ROOT = Path.home() / ".openclaw"
OPENCLAW_CONFIG_PATH = OPENCLAW_ROOT / "openclaw.json"


def resolve_openclaw_bin() -> str:
    env_match = shutil.which("openclaw")
    if env_match:
        return env_match
    candidate = Path.home() / ".nvm" / "versions" / "node" / "v22.22.1" / "bin" / "openclaw"
    if candidate.exists():
        return str(candidate)
    raise FileNotFoundError("Could not find the openclaw CLI. Add it to PATH or install OpenClaw locally.")


def detach_legacy_skill_entry() -> None:
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


def ensure_plugin_allowlist() -> None:
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


def install_plugin() -> None:
    openclaw_bin = resolve_openclaw_bin()
    subprocess.run([openclaw_bin, "plugins", "install", "--force", str(REPO_ROOT)], check=True)
    subprocess.run([openclaw_bin, "plugins", "enable", "agentbox-skills"], check=True)


def restart_gateway() -> None:
    subprocess.run([resolve_openclaw_bin(), "gateway", "restart"], check=True)

