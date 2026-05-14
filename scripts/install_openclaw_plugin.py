#!/usr/bin/env python3
from __future__ import annotations

import argparse

from openclaw_plugin_common import (
    REPO_ROOT,
    detach_legacy_skill_entry,
    ensure_plugin_allowlist,
    install_plugin,
    restart_gateway,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the agentbox-skills plugin into local OpenClaw."
    )
    parser.add_argument(
        "--no-restart",
        action="store_true",
        help="Install and enable the plugin, but do not restart the OpenClaw gateway.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    detach_legacy_skill_entry()
    install_plugin()
    ensure_plugin_allowlist()
    if not args.no_restart:
        restart_gateway()
    print(f"Installed plugin from {REPO_ROOT}")
    print("Preserved runtime data, OpenClaw session history, and local workspace directories")
    if args.no_restart:
        print("Skipped OpenClaw gateway restart; restart manually when you want the updated plugin to load")
    else:
        print("Restarted OpenClaw gateway")


if __name__ == "__main__":
    main()
