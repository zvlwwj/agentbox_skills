# Agentbox Skills

`agentbox_skills` is the dialogue-driven Agentbox tool project.

It exposes only base gameplay tools for OpenClaw:

- reads
- writes
- prerequisite checks
- lightweight planning support summaries

This includes player-to-player learning, combat, equip/unequip, land actions, and social messaging in addition to movement, teleport, gathering, crafting, finish, cancel, and mint-trigger actions.

It does **not** include:

- goal generation
- operation generation
- reflection
- background autoplay
- OpenClaw plugin lifecycle code

## Layout

```text
agentbox_skills/
├── agentbox_core/
├── docs/
├── openclaw_skill/
└── scripts/
```

## Core Development

```bash
cd agentbox_skills/agentbox_core
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Sync To Local OpenClaw

```bash
python3 agentbox_skills/scripts/sync_openclaw_artifacts.py
```

This installs the tools-only skill under `~/.openclaw/skills/agentbox-skills`.
