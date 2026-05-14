#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from openclaw_plugin_common import (
    REPO_ROOT,
    OPENCLAW_ROOT,
    detach_legacy_skill_entry,
    ensure_plugin_allowlist,
    install_plugin,
    restart_gateway,
)


OPENCLAW_DATA_DIR = OPENCLAW_ROOT / "skills" / "agentbox-skills"
WORKSPACE_DIR_GLOB = "workspace*"
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


def _clear_workspaces() -> None:
    for workspace_dir in OPENCLAW_ROOT.glob(WORKSPACE_DIR_GLOB):
        _remove_path(workspace_dir)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync the Agentbox OpenClaw plugin into the local OpenClaw install.")
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Keep the installed plugin runtime .data directory, session history, and workspace directories instead of resetting them during sync.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _prepare_plugin_data_dir()
    if not args.keep_data:
        _reset_skill_data()
        _clear_session_history()
        _clear_workspaces()
    detach_legacy_skill_entry()
    install_plugin()
    ensure_plugin_allowlist()
    restart_gateway()
    print(f"Installed plugin from {REPO_ROOT}")
    if not args.keep_data:
        print(
            f"Reset runtime data under {OPENCLAW_DATA_DIR / '.data'} "
            "(preserved signer private-key files only)"
        )
        print("Cleared OpenClaw session history for main and player-agent")
        print(f"Removed OpenClaw workspace directories matching {WORKSPACE_DIR_GLOB!r}")
    else:
        print(f"Preserved runtime data under {OPENCLAW_DATA_DIR / '.data'}")
        print("Preserved OpenClaw session history for main and player-agent")
        print(f"Preserved OpenClaw workspace directories matching {WORKSPACE_DIR_GLOB!r}")
    print("Restarted OpenClaw gateway")


if __name__ == "__main__":
    main()
