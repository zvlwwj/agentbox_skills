#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HERMES_ROOT = Path.home() / ".hermes"
HERMES_CONFIG_PATH = HERMES_ROOT / "config.yaml"
HERMES_AGENTBOX_HOME = HERMES_ROOT / "agentbox"
HERMES_BIN_DIR = HERMES_ROOT / "bin"
HERMES_SKILLS_DIR = HERMES_ROOT / "skills"
SOURCE_SKILL_DIR = REPO_ROOT / "hermes_skill" / "agentbox-hermes-skills"
INSTALLED_SKILL_DIR = HERMES_SKILLS_DIR / "agentbox-hermes-skills"
CLI_SOURCE = REPO_ROOT / "scripts" / "agentbox-hermes"
CLI_TARGET = HERMES_BIN_DIR / "agentbox-hermes"
BACKGROUND_STATE_PATH = HERMES_AGENTBOX_HOME / "background_runner_state.json"
LAST_SUMMARY_PATH = HERMES_AGENTBOX_HOME / "last_execution_summary.md"
SKILL_DOCS = [
    "AGENTBOX_ID_SEMANTICS.md",
    "HERMES_PLANNER_PROMPT.md",
    "HERMES_EXECUTOR_PROMPT.md",
]
AGENTBOX_SKILL_NAMES = {
    "agentbox-hermes-skills",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install Hermes-compatible Agentbox skills and local CLI."
    )
    parser.add_argument(
        "--no-bin-link",
        action="store_true",
        help="Skip creating ~/.hermes/bin/agentbox-hermes.",
    )
    parser.add_argument(
        "--skip-bridge-service",
        action="store_true",
        help="Skip installing the auto-managed Hermes local bridge LaunchAgent.",
    )
    return parser.parse_args()


def _ensure_hermes_config() -> None:
    if not HERMES_CONFIG_PATH.exists():
        HERMES_ROOT.mkdir(parents=True, exist_ok=True)
        HERMES_CONFIG_PATH.write_text("skills:\n  external_dirs: []\n")


def _read_config_lines() -> list[str]:
    return HERMES_CONFIG_PATH.read_text().splitlines()


def _write_config_lines(lines: list[str]) -> None:
    HERMES_CONFIG_PATH.write_text("\n".join(lines) + "\n")


def _skill_frontmatter_name(skill_md: Path) -> str | None:
    try:
        for line in skill_md.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("name:"):
                return stripped.split(":", 1)[1].strip().strip("'\"")
    except OSError:
        return None
    return None


def _contains_agentbox_hermes_skill(directory: Path) -> bool:
    if not directory.exists() or not directory.is_dir():
        return False
    for skill_md in directory.rglob("SKILL.md"):
        if any(part in {".git", ".github", ".hub", ".archive"} for part in skill_md.parts):
            continue
        if _skill_frontmatter_name(skill_md) in AGENTBOX_SKILL_NAMES:
            return True
    return False


def _find_skills_block(lines: list[str]) -> tuple[int, int]:
    start = next((idx for idx, line in enumerate(lines) if line.strip() == "skills:"), -1)
    if start == -1:
        lines.extend(["", "skills:", "  external_dirs: []"])
        start = len(lines) - 2
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        line = lines[idx]
        if not line.startswith((" ", "\t")) and line.strip() and not line.startswith("#"):
            end = idx
            break
    return start, end


def _remove_agentbox_external_dirs() -> bool:
    lines = _read_config_lines()
    changed = False

    # Agentbox Hermes skills should be installed into ~/.hermes/skills, the same
    # location used by normal Hermes skill installs. Keeping a source checkout in
    # external_dirs can shadow or duplicate the installed skill.
    deduped_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- "):
            candidate = stripped[2:].strip()
            try:
                candidate_path = Path(candidate).expanduser().resolve()
            except OSError:
                candidate_path = Path(candidate).expanduser()
            if _contains_agentbox_hermes_skill(candidate_path):
                changed = True
                continue
        deduped_lines.append(line)

    if changed:
        _write_config_lines(deduped_lines)
    return changed


def _install_skill_files() -> None:
    if not (SOURCE_SKILL_DIR / "SKILL.md").exists():
        raise FileNotFoundError(f"Missing Hermes skill source: {SOURCE_SKILL_DIR / 'SKILL.md'}")

    if INSTALLED_SKILL_DIR.exists() or INSTALLED_SKILL_DIR.is_symlink():
        if INSTALLED_SKILL_DIR.is_symlink() or INSTALLED_SKILL_DIR.is_file():
            INSTALLED_SKILL_DIR.unlink()
        else:
            shutil.rmtree(INSTALLED_SKILL_DIR)

    (INSTALLED_SKILL_DIR / "docs").mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_SKILL_DIR / "SKILL.md", INSTALLED_SKILL_DIR / "SKILL.md")
    for doc_name in SKILL_DOCS:
        shutil.copy2(REPO_ROOT / "docs" / doc_name, INSTALLED_SKILL_DIR / "docs" / doc_name)


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


def _install_bridge_service() -> None:
    print("Installing Agentbox Hermes bridge service...")
    result = subprocess.run(
        [str(CLI_TARGET), "bridge", "install-service"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode != 0:
        if result.stderr.strip():
            print(result.stderr.strip())
        raise SystemExit(f"Failed to install Hermes bridge service with exit code {result.returncode}")


def _print_validation_steps(bin_linked: bool, bridge_service_installed: bool) -> None:
    print(f"Hermes skill directory: {INSTALLED_SKILL_DIR}")
    print(f"Hermes Agentbox state dir: {HERMES_AGENTBOX_HOME}")
    if bin_linked:
        print(f"CLI entry installed at: {CLI_TARGET}")
    else:
        print(f"CLI source available at: {CLI_SOURCE}")
    if bridge_service_installed:
        print("Hermes bridge service installed and managed by macOS LaunchAgent.")
        print(f"Bridge base URL: http://127.0.0.1:18889/plugins/agentbox-hermes/bridge")
        print(f"Bridge token command: {CLI_TARGET} bridge token")
        print(f"Bridge status command: {CLI_TARGET} bridge status")
    else:
        print("Hermes bridge service was not installed.")
        print(f"Debug bridge command: {CLI_TARGET if bin_linked else CLI_SOURCE} bridge start")
    print("Validation commands:")
    print("  1. Restart Hermes or open a fresh Hermes session.")
    print("  2. In Hermes, run skills_list() and confirm agentbox-hermes-skills appears.")
    if bin_linked:
        print(f"  3. Run: {CLI_TARGET} signer read")
        print(f"  4. Run: {CLI_TARGET} bridge status")
    else:
        print(f"  3. Run: {CLI_SOURCE} signer read")


def main() -> None:
    args = parse_args()
    _ensure_hermes_config()
    removed_external_dirs = _remove_agentbox_external_dirs()
    _install_skill_files()
    _ensure_state_files()

    hermes_binary = shutil.which("hermes")
    if not args.no_bin_link:
        _ensure_cli_link()

    if hermes_binary:
        print(f"Detected Hermes CLI: {hermes_binary}")
    else:
        print("Warning: `hermes` binary was not found on PATH. Skills can still be installed if Hermes is configured elsewhere.")

    if removed_external_dirs:
        print(f"Removed Agentbox Hermes external skill dir entries from {HERMES_CONFIG_PATH}")
    else:
        print(f"No Agentbox Hermes external skill dir entries found in {HERMES_CONFIG_PATH}")
    print(f"Installed Agentbox Hermes skill to {INSTALLED_SKILL_DIR}")

    bridge_service_installed = False
    if args.skip_bridge_service:
        print("Skipped Hermes bridge service installation.")
    elif args.no_bin_link:
        print("Skipped Hermes bridge service installation because --no-bin-link was set.")
    else:
        _install_bridge_service()
        bridge_service_installed = True

    _print_validation_steps(bin_linked=not args.no_bin_link, bridge_service_installed=bridge_service_installed)


if __name__ == "__main__":
    main()
