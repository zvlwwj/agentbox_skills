#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_ROOT = REPO_ROOT / "agentbox_core"
SKILL_ROOT = REPO_ROOT / "openclaw_skill" / "agentbox-skills"
OPENCLAW_ROOT = Path.home() / ".openclaw"
OPENCLAW_SKILL_DIR = OPENCLAW_ROOT / "skills" / "agentbox-skills"
SESSION_DIRS = [
    OPENCLAW_ROOT / "agents" / "main" / "sessions",
    OPENCLAW_ROOT / "agents" / "player-agent" / "sessions",
]

CORE_RUNTIME_PATHS = [
    "abi",
    "agentbox_runtime",
    "skill_player",
    "deployments.json",
]

ROOT_ENTRY_FILES = {
    "main.py": CORE_ROOT / "skill_player" / "main.py",
    "manifest.json": CORE_ROOT / "skill_player" / "manifest.json",
}

PRESERVED_DATA_CHILDREN = {
    "signers",
}


def _remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def _copy_path(src: Path, dst: Path) -> None:
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def _sync_managed_skill_install() -> None:
    OPENCLAW_SKILL_DIR.mkdir(parents=True, exist_ok=True)
    for child in list(OPENCLAW_SKILL_DIR.iterdir()):
        if child.name == ".data":
            continue
        _remove_path(child)
    shutil.copy2(SKILL_ROOT / "SKILL.md", OPENCLAW_SKILL_DIR / "SKILL.md")
    for filename, src in ROOT_ENTRY_FILES.items():
        shutil.copy2(src, OPENCLAW_SKILL_DIR / filename)
    for rel_path in CORE_RUNTIME_PATHS:
        _copy_path(CORE_ROOT / rel_path, OPENCLAW_SKILL_DIR / rel_path)


def _reset_skill_data() -> None:
    data_dir = OPENCLAW_SKILL_DIR / ".data"
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


def _restart_gateway() -> None:
    subprocess.run(["openclaw", "gateway", "restart"], check=True)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync the tools-only Agentbox skill into the local OpenClaw install.")
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Keep the installed skill's .data directory instead of resetting it during sync.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _sync_managed_skill_install()
    if not args.keep_data:
        _reset_skill_data()
        _clear_session_history()
    _restart_gateway()
    print(f"Synced managed skill to {OPENCLAW_SKILL_DIR}")
    if not args.keep_data:
        print(
            f"Reset runtime data under {OPENCLAW_SKILL_DIR / '.data'} "
            "(preserved signer private-key files only)"
        )
        print("Cleared OpenClaw session history for main and player-agent")
    else:
        print(f"Preserved runtime data under {OPENCLAW_SKILL_DIR / '.data'}")
        print("Preserved OpenClaw session history for main and player-agent")
    print("Restarted OpenClaw gateway")


if __name__ == "__main__":
    main()
