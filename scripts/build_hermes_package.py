#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "dist" / "hermes"
PACKAGE_DIR_NAME = "agentbox-hermes"
INSTALLER_PACKAGE_DIR_NAME = "agentbox-hermes-installer"

INCLUDED_FILES = [
    "package-lock.json",
    "scripts/agentbox-hermes",
    "scripts/agentbox-hermes.js",
    "scripts/agentbox-hermes-bridge.js",
    "scripts/install_hermes_skills.py",
    "runtime/clients.js",
    "runtime/common.js",
    "runtime/contracts.js",
    "runtime/operations.js",
    "runtime/player-runtime.js",
    "runtime/settings.js",
    "hermes_skill/agentbox-hermes-skills/SKILL.md",
    "docs/AGENTBOX_ID_SEMANTICS.md",
    "docs/HERMES_CRON_PROMPT.md",
    "agentbox_core/deployments.json",
    "agentbox_core/abi/AgentboxConfig.json",
    "agentbox_core/abi/AgentboxEconomy.json",
    "agentbox_core/abi/AgentboxLand.json",
    "agentbox_core/abi/AgentboxRandomizer.json",
    "agentbox_core/abi/AgentboxResource.json",
    "agentbox_core/abi/AgentboxRole.json",
    "agentbox_core/abi/AgentboxRoleWallet.json",
    "agentbox_core/abi/IAgentboxCore.json",
]

CHECK_JS_FILES = [
    "scripts/agentbox-hermes.js",
    "scripts/agentbox-hermes-bridge.js",
    "runtime/clients.js",
    "runtime/common.js",
    "runtime/contracts.js",
    "runtime/operations.js",
    "runtime/player-runtime.js",
    "runtime/settings.js",
]

PACKAGE_README = """# Agentbox Hermes Skills

Hermes-compatible Agentbox skill and local CLI bundle.

Hermes skills are discovered from skill directories that contain `SKILL.md`.
This package keeps the Agentbox gameplay skill under:

- `hermes_skill/agentbox-hermes-skills/SKILL.md`

Hermes official skill publishing can expose the instruction layer, but the
complete Agentbox Hermes experience requires this bundle because it includes
the CLI, runtime, local bridge, and LaunchAgent service.

## Install

After extracting this archive:

```bash
cd agentbox-hermes
npm install --omit=dev --ignore-scripts
python3 scripts/install_hermes_skills.py
```

The installer will:

- add `hermes_skill` to `~/.hermes/config.yaml` under `skills.external_dirs`
- create `~/.hermes/bin/agentbox-hermes`
- initialize `~/.hermes/agentbox/`
- install the optional managed local bridge service unless skipped

For development without the managed bridge service:

```bash
python3 scripts/install_hermes_skills.py --skip-bridge-service
```

## Verify

```bash
~/.hermes/bin/agentbox-hermes signer read
~/.hermes/bin/agentbox-hermes bridge status
```

Then restart Hermes or open a fresh Hermes session and confirm
`agentbox-hermes-skills` appears in the skills list.

"""

INSTALLER_README = """# Agentbox Hermes Installer Skill

Lightweight Hermes skill that downloads and installs the full Agentbox Hermes bundle.

Publish this installer skill through the official Hermes skill channel. The full
runtime bundle is distributed separately as `agentbox-hermes.zip`.

After installing this skill, users can ask Hermes:

```text
Help me download and install Agentbox.
```

The skill will download:

```text
https://github.com/zvlwwj/agentbox_skills/releases/latest/download/agentbox-hermes.zip
```

and install the full CLI/runtime/bridge bundle locally.

"""


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def copy_file(relative_path: str, package_dir: Path) -> None:
    source = REPO_ROOT / relative_path
    if not source.exists():
        raise FileNotFoundError(f"Missing required file: {source}")
    target = package_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    if relative_path.startswith("agentbox_core/abi/"):
        payload = json.loads(source.read_text())
        abi = payload if isinstance(payload, list) else payload.get("abi")
        if not isinstance(abi, list):
            raise ValueError(f"ABI artifact does not contain an abi array: {source}")
        target.write_text(json.dumps(abi, separators=(",", ":")) + "\n")
        return
    if relative_path == "package-lock.json":
        payload = json.loads(source.read_text())
        payload["name"] = PACKAGE_DIR_NAME
        payload["version"] = package_version()
        if "" in payload.get("packages", {}):
            payload["packages"][""]["name"] = PACKAGE_DIR_NAME
            payload["packages"][""]["version"] = package_version()
        target.write_text(json.dumps(payload, indent=2) + "\n")
        return
    shutil.copy2(source, target)


def package_version() -> str:
    payload = json.loads((REPO_ROOT / "package.json").read_text())
    return str(payload.get("version", "0.0.0"))


def write_package_json(package_dir: Path) -> None:
    source = json.loads((REPO_ROOT / "package.json").read_text())
    payload = {
        "name": PACKAGE_DIR_NAME,
        "version": package_version(),
        "description": "Hermes-compatible Agentbox skill and local CLI bundle.",
        "type": "module",
        "dependencies": source.get("dependencies", {}),
    }
    (package_dir / "package.json").write_text(json.dumps(payload, indent=2) + "\n")


def write_readme(package_dir: Path) -> None:
    (package_dir / "README.md").write_text(PACKAGE_README, encoding="utf8")


def write_manifest(package_dir: Path) -> None:
    payload = {
        "package": PACKAGE_DIR_NAME,
        "name": "Agentbox Hermes Skills",
        "version": package_version(),
        "family": "hermes-skills",
        "source": "generated by scripts/build_hermes_package.py",
        "skillExternalDir": "hermes_skill",
        "included": ["README.md", "package.json", *INCLUDED_FILES],
    }
    (package_dir / "hermes-package.json").write_text(json.dumps(payload, indent=2) + "\n")


def write_installer_manifest(package_dir: Path) -> None:
    payload = {
        "package": INSTALLER_PACKAGE_DIR_NAME,
        "name": "Agentbox Hermes Installer",
        "version": package_version(),
        "family": "hermes-skill",
        "source": "generated by scripts/build_hermes_package.py",
        "included": ["README.md", "SKILL.md"],
    }
    (package_dir / "hermes-package.json").write_text(json.dumps(payload, indent=2) + "\n")


def run_node_checks(package_dir: Path) -> None:
    for relative_path in CHECK_JS_FILES:
        subprocess.run(["node", "--check", str(package_dir / relative_path)], check=True)


def build_zip(package_dir: Path) -> Path:
    archive_path = package_dir.parent / f"{package_dir.name}.zip"
    if archive_path.exists():
        archive_path.unlink()
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(package_dir.rglob("*")):
            if path.is_dir():
                continue
            archive.write(path, path.relative_to(package_dir.parent))
    return archive_path


def build_package(output_root: Path, skip_checks: bool) -> Path:
    package_dir = output_root / PACKAGE_DIR_NAME
    if package_dir.exists():
        remove_path(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)

    for relative_path in INCLUDED_FILES:
        copy_file(relative_path, package_dir)
    write_package_json(package_dir)
    write_readme(package_dir)
    write_manifest(package_dir)

    if not skip_checks:
        run_node_checks(package_dir)

    return package_dir


def build_installer_package(output_root: Path) -> Path:
    package_dir = output_root / INSTALLER_PACKAGE_DIR_NAME
    if package_dir.exists():
        remove_path(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPO_ROOT / "hermes_skill" / "agentbox-hermes-installer" / "SKILL.md", package_dir / "SKILL.md")
    (package_dir / "README.md").write_text(INSTALLER_README, encoding="utf8")
    write_installer_manifest(package_dir)
    return package_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a Hermes skill + CLI bundle for Agentbox.")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Directory that will contain the generated {PACKAGE_DIR_NAME} package.",
    )
    parser.add_argument("--skip-checks", action="store_true", help="Skip node --check validation.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package_dir = build_package(args.output_root.resolve(), args.skip_checks)
    installer_package_dir = build_installer_package(args.output_root.resolve())
    archive_path = build_zip(package_dir)
    installer_archive_path = build_zip(installer_package_dir)
    print(f"Built Hermes package directory: {package_dir}")
    print(f"Built Hermes archive: {archive_path}")
    print(f"Built Hermes installer skill directory: {installer_package_dir}")
    print(f"Built Hermes installer skill archive: {installer_archive_path}")


if __name__ == "__main__":
    main()
