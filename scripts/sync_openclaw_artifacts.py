#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OPENCLAW_ROOT = Path.home() / ".openclaw"
OPENCLAW_DATA_DIR = OPENCLAW_ROOT / "skills" / "agentbox-skills"
OPENCLAW_CONFIG_PATH = OPENCLAW_ROOT / "openclaw.json"
SESSION_DIRS = [
    OPENCLAW_ROOT / "agents" / "main" / "sessions",
    OPENCLAW_ROOT / "agents" / "player-agent" / "sessions",
]

PRESERVED_DATA_CHILDREN = {
    "signers",
}


def _remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def _prepare_plugin_data_dir() -> None:
    OPENCLAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    for child in list(OPENCLAW_DATA_DIR.iterdir()):
        if child.name == ".data":
            continue
        _remove_path(child)


def _reset_skill_data() -> None:
    data_dir = OPENCLAW_DATA_DIR / ".data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for child in list(data_dir.iterdir()):
        if child.name in PRESERVED_DATA_CHILDREN:
            continue
        _remove_path(child)


def _clear_session_history() -> None:
    for sessions_dir in SESSION_DIRS:
        if not sessions_dir.exists():
            continue
        for item in sessions_dir.iterdir():
            if item.name == "sessions.json":
                item.write_text("{}\n")
                continue
            if item.is_file() and (
                item.suffix == ".jsonl"
                or item.name.endswith(".jsonl.reset")
                or ".jsonl.reset." in item.name
            ):
                item.unlink()


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


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync the Agentbox OpenClaw plugin into the local OpenClaw install.")
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Keep the installed plugin runtime .data directory instead of resetting it during sync.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _prepare_plugin_data_dir()
    if not args.keep_data:
        _reset_skill_data()
        _clear_session_history()
    _detach_legacy_skill_entry()
    _install_plugin()
    _ensure_plugin_allowlist()
    _restart_gateway()
    print(f"Installed plugin from {REPO_ROOT}")
    if not args.keep_data:
        print(
            f"Reset runtime data under {OPENCLAW_DATA_DIR / '.data'} "
            "(preserved signer private-key files only)"
        )
        print("Cleared OpenClaw session history for main and player-agent")
    else:
        print(f"Preserved runtime data under {OPENCLAW_DATA_DIR / '.data'}")
        print("Preserved OpenClaw session history for main and player-agent")
    print("Restarted OpenClaw gateway")


if __name__ == "__main__":
    main()
