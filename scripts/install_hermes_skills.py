#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HERMES_ROOT = Path.home() / ".hermes"
HERMES_CONFIG_PATH = HERMES_ROOT / "config.yaml"
HERMES_AGENTBOX_HOME = HERMES_ROOT / "agentbox"
HERMES_BIN_DIR = HERMES_ROOT / "bin"
HERMES_SKILL_DIR = REPO_ROOT / "hermes_skill"
CLI_SOURCE = REPO_ROOT / "scripts" / "agentbox-hermes"
CLI_TARGET = HERMES_BIN_DIR / "agentbox-hermes"
BACKGROUND_STATE_PATH = HERMES_AGENTBOX_HOME / "background_runner_state.json"
LAST_SUMMARY_PATH = HERMES_AGENTBOX_HOME / "last_execution_summary.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install Hermes-compatible Agentbox skills and local CLI."
    )
    parser.add_argument(
        "--no-bin-link",
        action="store_true",
        help="Skip creating ~/.hermes/bin/agentbox-hermes.",
    )
    return parser.parse_args()


def _ensure_hermes_config() -> None:
    if not HERMES_CONFIG_PATH.exists():
        raise SystemExit(f"Hermes config was not found: {HERMES_CONFIG_PATH}")


def _read_config_lines() -> list[str]:
    return HERMES_CONFIG_PATH.read_text().splitlines()


def _write_config_lines(lines: list[str]) -> None:
    HERMES_CONFIG_PATH.write_text("\n".join(lines) + "\n")


def _find_skills_block(lines: list[str]) -> tuple[int, int]:
    start = next((idx for idx, line in enumerate(lines) if line.strip() == "skills:"), -1)
    if start == -1:
        raise SystemExit("Could not find `skills:` block in ~/.hermes/config.yaml")
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        line = lines[idx]
        if not line.startswith((" ", "\t")) and line.strip() and not line.startswith("#"):
            end = idx
            break
    return start, end


def _ensure_external_dir() -> bool:
    lines = _read_config_lines()
    target = str(HERMES_SKILL_DIR.resolve())
    if any(line.strip().lstrip("-").strip() == target for line in lines):
        return False

    start, end = _find_skills_block(lines)
    external_idx = -1
    for idx in range(start + 1, end):
      if lines[idx].strip() == "external_dirs:":
        external_idx = idx
        break

    if external_idx != -1:
        insert_at = external_idx + 1
        while insert_at < end and (lines[insert_at].startswith("    - ") or not lines[insert_at].strip()):
            insert_at += 1
        lines.insert(insert_at, f"    - {target}")
    else:
        insertion = ["  external_dirs:", f"    - {target}", ""]
        lines[start + 1:start + 1] = insertion

    _write_config_lines(lines)
    return True


def _ensure_state_files() -> None:
    HERMES_AGENTBOX_HOME.mkdir(parents=True, exist_ok=True)
    if not BACKGROUND_STATE_PATH.exists():
        BACKGROUND_STATE_PATH.write_text("{}\n")
    if not LAST_SUMMARY_PATH.exists():
        LAST_SUMMARY_PATH.write_text("")


def _ensure_cli_link() -> None:
    HERMES_BIN_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CLI_SOURCE, 0o755)
    if CLI_TARGET.exists() or CLI_TARGET.is_symlink():
        CLI_TARGET.unlink()
    CLI_TARGET.symlink_to(CLI_SOURCE)


def _print_validation_steps(bin_linked: bool) -> None:
    print(f"Hermes skill directory: {HERMES_SKILL_DIR.resolve()}")
    print(f"Hermes Agentbox state dir: {HERMES_AGENTBOX_HOME}")
    if bin_linked:
        print(f"CLI entry installed at: {CLI_TARGET}")
    else:
        print(f"CLI source available at: {CLI_SOURCE}")
    print("Validation commands:")
    print("  1. Restart Hermes or open a fresh Hermes session.")
    print("  2. In Hermes, run skills_list() and confirm agentbox-hermes-skills / agentbox-hermes-cron-orchestrator appear.")
    if bin_linked:
        print(f"  3. Run: {CLI_TARGET} signer read")
    else:
        print(f"  3. Run: {CLI_SOURCE} signer read")


def main() -> None:
    args = parse_args()
    _ensure_hermes_config()
    changed = _ensure_external_dir()
    _ensure_state_files()

    hermes_binary = shutil.which("hermes")
    if not args.no_bin_link:
        _ensure_cli_link()

    if hermes_binary:
        print(f"Detected Hermes CLI: {hermes_binary}")
    else:
        print("Warning: `hermes` binary was not found on PATH. Skills can still be installed if Hermes is configured elsewhere.")

    if changed:
        print(f"Added Hermes external skill dir to {HERMES_CONFIG_PATH}")
    else:
        print(f"Hermes external skill dir already present in {HERMES_CONFIG_PATH}")

    _print_validation_steps(bin_linked=not args.no_bin_link)


if __name__ == "__main__":
    main()
