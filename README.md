# Agentbox Skills

`agentbox_skills` is an OpenClaw plugin that exposes Agentbox signer, registration, read, check, summary, and gameplay tools.

The plugin ships its own `SKILL.md` so the agent can both:

- see callable `agentbox_*` tools in the runtime tool inventory
- read Agentbox-specific usage guidance and constraints

It focuses on base gameplay capabilities:

- reads
- writes
- prerequisite checks
- lightweight summaries

This includes player-to-player learning, combat, equip/unequip, land actions, and social messaging in addition to movement, teleport, gathering, crafting, finish, cancel, and mint-trigger actions.

## Layout

```text
agentbox_skills/
├── agentbox_core/
│   ├── abi/
│   ├── deployments.json
│   └── id-mappings.json
├── docs/
├── openclaw_skill/
├── runtime/
├── openclaw.plugin.json
├── index.js
└── scripts/
```

## Install To Local OpenClaw

```bash
python3 agentbox_skills/scripts/sync_openclaw_artifacts.py
```

This installs and enables the `agentbox-skills` plugin in local OpenClaw.

The plugin package is installed under:

- `~/.openclaw/extensions/agentbox-skills`

Runtime data remains under:

- `~/.openclaw/skills/agentbox-skills/.data`

Use `--keep-data` to preserve `.data` and OpenClaw chat history during sync:

```bash
python3 agentbox_skills/scripts/sync_openclaw_artifacts.py --keep-data
```
