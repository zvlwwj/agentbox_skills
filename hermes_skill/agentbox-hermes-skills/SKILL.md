---
name: agentbox-hermes-skills
description: Base Agentbox gameplay skill for Hermes Agent on Base Sepolia. Use Hermes terminal/file/skills tools to call the local agentbox-hermes CLI for gameplay reads, prerequisite checks, Operation Manager, and onchain actions.
requires_toolsets: [terminal, file, skills]
requires_tools: [terminal, read_file]
---

# Agentbox Hermes Skills

## Description

This skill provides Agentbox state reads, prerequisite checks, operation management, and onchain action execution for Hermes Agent.

Use the local CLI for execution:

- Preferred: `agentbox-hermes`
- Fallback: `~/.hermes/bin/agentbox-hermes`

Commands return JSON by default.

- When `--role` is omitted, commands use the locally stored `active roleWallet`.
- When speaking to users, prefer semantic names instead of raw IDs. Common ID mappings live in `agentbox_skills/docs/AGENTBOX_ID_SEMANTICS.md`.

## Command Reference

### Operation Manager

Background jobs use Operation Manager for long-running operation state; the per-round flow is defined by `agentbox_skills/docs/HERMES_CRON_PROMPT.md`.

Available commands:

- `agentbox-hermes operations read-state`
- `agentbox-hermes operations add-plan --goal <GOAL> --actions-json '<JSON_ARRAY>'`
- `agentbox-hermes operations start-next`
- `agentbox-hermes operations next-action`
- `agentbox-hermes operations update-action --operation-id <ID> --action-id <ID> --status <STATUS>`
- `agentbox-hermes operations finish-current`
- `agentbox-hermes operations cancel-current`
- `agentbox-hermes operations clear-completed`
- `agentbox-hermes operations reconcile`
- `agentbox-hermes operations reconcile --apply`

### State Reads

- `agentbox-hermes read role-snapshot`: read the full role snapshot; use `--source chain` when verifying actual onchain state changes.
- `agentbox-hermes read world-static`: read map config, NPCs, recipes, equipment, and resource-point catalogs.
- `agentbox-hermes read world-dynamic`: read current block, current land, nearby roles/lands, ground AGC, and recent mint signals.
- `agentbox-hermes read land --x <X> --y <Y>` or `--land-id <ID>`: read one land in detail. Coordinates are always `(x, y)`; do not split `landId` digits into coordinates.
- `agentbox-hermes read last-mint`: read the latest mint event.
- `agentbox-hermes read global-config`: read map, timing, and economy config.

Optional source override:

- `--source auto`
- `--source chain`
- `--source indexer`

### Prerequisite Checks

- `agentbox-hermes check finishable`: check whether the current action can finish.
- `agentbox-hermes check gather --amount <N>`: check gathering prerequisites; each resource point supports at most `10` active gatherers.
- `agentbox-hermes check learn --npc-id <ID>`: check NPC learning prerequisites.
- `agentbox-hermes check craft --recipe-id <ID>`: check crafting prerequisites.
- `agentbox-hermes check trigger-mint`: check mint prerequisites; trust onchain `lastMintBlock` and `mintsCount`, while ground AGC is only a strategy signal.
- `agentbox-hermes check stabilize`: check whether unreliable AGC is worth attempting to stabilize.

### Onchain Actions

Common permission rule: a local signer is required. If the role has a `controller`, the signer must be the `controller`; otherwise the signer must be the `owner`.

- `agentbox-hermes action move --x <X> --y <Y>`: move to a coordinate; requires `Idle`, in-bounds target, and distance within `speed`.
- `agentbox-hermes action teleport --x <X> --y <Y>`: start teleporting; requires `Idle`, in-bounds target, and target not equal to current position.
- `agentbox-hermes action finish`: finish the current action; requires `finishable.canFinish = true`, supporting `Learning / Crafting / Gathering / Teleporting / Attacking`.
- `agentbox-hermes action gather --amount <N>`: start gathering; requires `Idle`, standing on a resource point, learned matching skill, and resource point not full.
- `agentbox-hermes action learn --npc-id <ID>`: learn from an NPC; requires `Idle`, exact NPC coordinate, idle NPC, and unlearned skill.
- `agentbox-hermes action craft --recipe-id <ID>`: start crafting; requires `Idle`, existing recipe, learned skill, and enough resources.
- `agentbox-hermes action attack --target-wallet <ADDRESS>`: immediate attack; requires `Idle`, alive target, and target in range.
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`: start asynchronous attack; later use `action finish` to settle damage.
- `agentbox-hermes action equip --equipment-id <ID>`: equip an item; requires `Idle` and role-owned equipment.
- `agentbox-hermes action unequip --slot <ID>`: unequip an item; requires `Idle` and occupied slot.
- `agentbox-hermes action cancel`: cancel current action; supports `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`; crafting resources are not refunded.
- `agentbox-hermes action trigger-mint`: trigger mint; requires `mintsCount < maxMintCount` and elapsed onchain mint interval.
- `agentbox-hermes action stabilize`: stabilize matured unreliable AGC; does not require `Idle` and may stabilize only part of the balance.
- `agentbox-hermes action transfer --amount <N>`: transfer reliable AGC from the role wallet back to owner; only reliable AGC can be transferred.

## User-Facing Language

- Prefer semantic names such as `Blacksmith`, `Armor crafting`, and `Shoes slot`.
- Only include IDs in parentheses for debugging, config validation, or when the user explicitly asks for them.

Example:

- Do not say: `go to npcId=4 and learn skillId=5`
- Say: `go to the Blacksmith and learn Bow crafting`

## Important Boundaries

- Hermes skills are instructions; the CLI performs the real actions.
- Do not assume Hermes has OpenClaw plugin tools.
- Long-running gameplay state should be read from Operation Manager state under `~/.hermes/agentbox/`.
