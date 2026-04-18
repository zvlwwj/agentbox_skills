# Agentbox Skills

`agentbox_skills` ships two integration surfaces:

- an OpenClaw plugin that exposes Agentbox signer, registration, read, check, summary, and gameplay tools
- a Hermes-compatible skill + local CLI bundle for Hermes-native automation

It currently ships these skill sets:

- `agentbox-skills`: the base Agentbox gameplay skill with concrete tool inventory, action semantics, prerequisite checks, and gameplay guidance
- `agentbox-cron-orchestrator`: a helper skill for creating and maintaining a stable background Agentbox cron job in OpenClaw
- `agentbox-hermes-skills`: the Hermes-native gameplay skill that drives a local `agentbox-hermes` CLI
- `agentbox-hermes-cron-orchestrator`: a Hermes-native helper skill for creating and maintaining background cron jobs

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
├── hermes_skill/
│   ├── agentbox-hermes-skills/
│   │   ├── SKILL.md
│   │   └── SKILL_CN.md
│   ├── agentbox-hermes-cron-orchestrator/
│   │   ├── SKILL.md
│   │   └── SKILL_CN.md
├── openclaw_skill/
│   ├── agentbox-skills/
│   │   ├── SKILL.md
│   │   └── SKILL_CN.md
│   ├── agentbox-cron-orchestrator/
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

If you want to install without immediately restarting OpenClaw, use:

```bash
python3 agentbox_skills/scripts/install_openclaw_plugin.py --no-restart
```

In that mode the plugin is installed and enabled, but the updated code will not be loaded until you restart the OpenClaw gateway manually.

After install, OpenClaw will load the bundled skill from the plugin's `skills` array:

- `./openclaw_skill/agentbox-skills`
- `./openclaw_skill/agentbox-cron-orchestrator`

The plugin package is installed under:

- `~/.openclaw/extensions/agentbox-skills`

Runtime data remains under:

- `~/.openclaw/skills/agentbox-skills/.data`

## Install To Local Hermes

```bash
python3 agentbox_skills/scripts/install_hermes_skills.py
```

This installer:

- adds `agentbox_skills/hermes_skill` to `~/.hermes/config.yaml` under `skills.external_dirs`
- initializes `~/.hermes/agentbox/`
- creates `~/.hermes/bin/agentbox-hermes` as the Hermes CLI entrypoint

Hermes runtime state is stored under:

- `~/.hermes/agentbox/active_signer.json`
- `~/.hermes/agentbox/active_role.json`
- `~/.hermes/agentbox/background_runner_state.json`

If you only want the skill mount and state directory, but do not want the CLI symlink:

```bash
python3 agentbox_skills/scripts/install_hermes_skills.py --no-bin-link
```

## Hermes CLI

The Hermes integration uses a local CLI:

- preferred command: `agentbox-hermes`
- fallback path: `~/.hermes/bin/agentbox-hermes`

Examples:

```bash
agentbox-hermes signer read
agentbox-hermes registration confirm --profile-mode auto_generate
agentbox-hermes roles list-owned
agentbox-hermes roles select-active --role-wallet 0x...
agentbox-hermes read role-snapshot --source chain
agentbox-hermes check craft --recipe-id 2
agentbox-hermes action finish
```

The CLI writes signer and active-role state to `~/.hermes/agentbox/`, not to OpenClaw.

## Hermes Background Runs

Hermes background automation should attach:

- `agentbox-hermes-skills`
- `agentbox-hermes-cron-orchestrator`

and use the Hermes-specific prompt template:

- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

Hermes cron runs are fresh sessions, so long-running execution state must be persisted to:

- `~/.hermes/agentbox/background_runner_state.json`

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
