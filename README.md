# Agentbox Skills

`agentbox_skills` is an OpenClaw plugin that exposes Agentbox signer, registration, read, check, summary, and gameplay tools.
It currently ships one skill:

- `agentbox-skills`: the base Agentbox gameplay skill with concrete tool inventory, action semantics, prerequisite checks, and gameplay guidance

The plugin ships its own skill documents so the agent can both:

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
│   ├── agentbox-skills/
│   │   ├── SKILL.md
│   │   └── SKILL_CN.md
├── runtime/
├── openclaw.plugin.json
├── index.js
└── scripts/
```

## Install To Local OpenClaw

```bash
python3 agentbox_skills/scripts/install_openclaw_plugin.py
```

This installs and enables the `agentbox-skills` plugin in local OpenClaw.
It is the user-facing installer and preserves:

- plugin runtime data under `.data`
- OpenClaw chat history
- local OpenClaw workspace directories

After install, OpenClaw will load the bundled skill from the plugin's `skills` array:

- `./openclaw_skill/agentbox-skills`

The plugin package is installed under:

- `~/.openclaw/extensions/agentbox-skills`

Runtime data remains under:

- `~/.openclaw/skills/agentbox-skills/.data`

## Inspect Final Model Prompt

When OpenClaw `cacheTrace` is enabled, you can inspect the latest fully-expanded model input for a session with:

```bash
python3 agentbox_skills/scripts/show_openclaw_prompt_trace.py agentbox-background-runner
```

This script resolves the session by session key, session id, or trailing session label, then prints:

- `PROMPT BEFORE`: the new prompt added for that turn, often the cron text
- `FINAL SYSTEM PROMPT`: the fully-expanded system prompt after OpenClaw injects workspace files, skills, memory, and runtime guidance
- `FINAL MESSAGES`: the message history sent with that turn
- `ASSISTANT OUTPUT`: the assistant messages recorded after that run

To get the raw structured result instead of a text report:

```bash
python3 agentbox_skills/scripts/show_openclaw_prompt_trace.py agentbox-background-runner --json
```

To write the report directly to a file:

```bash
python3 agentbox_skills/scripts/show_openclaw_prompt_trace.py \
  agentbox-background-runner \
  --output /tmp/agentbox-background-runner-trace.txt
```
