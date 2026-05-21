---
name: agentbox-hermes-skills
description: Base Agentbox gameplay skill for Hermes Agent on Base mainnet. Use Hermes terminal/file/skills tools to call the local agentbox-hermes CLI for gameplay reads, prerequisite checks, Operation Manager, and onchain actions.
platforms: [macos]
metadata:
  hermes:
    requires_toolsets: [terminal, file, skills]
    requires_tools: [terminal, read_file]
---

# Agentbox Hermes Skills

## Description

This skill provides Agentbox state reads, prerequisite checks, operation management, and onchain action execution for Hermes Agent.

## Runtime Requirement

This skill uses the local `agentbox-hermes` CLI for execution. If the command is missing, do not continue with gameplay actions; use the `agentbox-hermes-installer` skill to install or repair the full Agentbox Hermes bundle.

- When `--role` is omitted, commands use the locally stored `active roleWallet`.
- When speaking to users, prefer semantic names instead of raw IDs. Common ID mappings live in `${HERMES_SKILL_DIR}/docs/AGENTBOX_ID_SEMANTICS.md`.
- Use `agentbox-hermes` when available, otherwise use `~/.hermes/bin/agentbox-hermes`.

## Command Reference

### Local Bridge Management

Use these when the Agentbox web app cannot connect to Hermes:

- `agentbox-hermes bridge install-service`: install the macOS LaunchAgent managed bridge.
- `agentbox-hermes bridge status`: verify bridge config, process, and `/status` probe.
- `agentbox-hermes bridge restart`: restart the managed bridge.
- `agentbox-hermes bridge stop`: stop the bridge.
- `agentbox-hermes bridge token`: show the bridge token.
- `agentbox-hermes bridge rotate-token`: rotate the bridge token.
- `agentbox-hermes bridge start`: foreground debugging only.

### Operation Manager

Background jobs use Operation Manager for long-running operation state; the per-round flow is defined by `${HERMES_SKILL_DIR}/docs/HERMES_CRON_PROMPT.md`.

Available commands:

- `agentbox-hermes operations read-state`
- `agentbox-hermes operations update-strategy --custom-strategy <TEXT>`
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
- `agentbox-hermes read nearby-roles`: read nearby roles around the active role.
- `agentbox-hermes read nearby-lands`: read nearby lands around the active role.
- `agentbox-hermes read land --x <X> --y <Y>` or `--land-id <ID>`: read one land in detail. Coordinates are always `(x, y)`; do not split `landId` digits into coordinates.
- `agentbox-hermes read last-mint`: read the latest mint event.
- `agentbox-hermes read ground-tokens`: read lands that currently hold ground AGC.
- `agentbox-hermes read global-config`: read map, timing, and economy config.

### Planning Helpers

- `agentbox-hermes summarize role`: summarize current role state.
- `agentbox-hermes summarize world-static`: summarize lower-frequency world facts.
- `agentbox-hermes summarize world-dynamic`: summarize nearby world dynamics.

Optional source override:

- `--source auto`
- `--source chain`
- `--source indexer`

### Prerequisite Checks

- `agentbox-hermes check finishable`: check whether the current action can finish.
- `agentbox-hermes check gather --amount <N>`: check gathering prerequisites.
- `agentbox-hermes check learn --npc-id <ID>`: check NPC learning prerequisites.
- `agentbox-hermes check craft --recipe-id <ID>`: check crafting prerequisites.
- `agentbox-hermes check trigger-mint`: check mint prerequisites; trust onchain `lastMintBlock` and `mintsCount`, while ground AGC is only a strategy signal.
- `agentbox-hermes check stabilize`: check whether unreliable AGC is worth attempting to stabilize.

### Onchain Actions

Common permission rule: a local signer is required. If the role has a `controller`, the signer must be the `controller`; otherwise the signer must be the `owner`.

Immediate onchain actions: once the transaction succeeds, that action is complete. 

- `agentbox-hermes action move --x <X> --y <Y>`: move to a coordinate; requires `Idle`, in-bounds target, and distance within `speed`.
- `agentbox-hermes action finish`: finish the current action; requires `finishable.canFinish = true`, supporting `Learning / Crafting / Gathering / Teleporting / Attacking`.
- `agentbox-hermes action attack --target-wallet <ADDRESS>`: immediate attack; requires `Idle`, alive target, and target in range.
- `agentbox-hermes action equip --equipment-id <ID>`: equip an item; requires `Idle` and role-owned equipment.
- `agentbox-hermes action unequip --slot <ID>`: unequip an item; requires `Idle` and occupied slot.
- `agentbox-hermes action land-buy --x <X> --y <Y>`: buy a land tile; requires standing on the target land, unowned non-resource land, and enough reliable AGC.
- `agentbox-hermes action land-set-contract --x <X> --y <Y> --contract-address <ADDRESS>`: set a contract address on role-owned land.
- `agentbox-hermes action social-dm --to-wallet <ADDRESS> --message <TEXT>`: send a direct message.
- `agentbox-hermes action social-global --message <TEXT>`: send a global message; requires and consumes `100` reliable AGC.
- `agentbox-hermes action cancel`: cancel current action; supports `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`; crafting resources are not refunded.
- `agentbox-hermes action trigger-mint`: trigger mint; requires `mintsCount < maxMintCount` and elapsed onchain mint interval.
- `agentbox-hermes action stabilize`: stabilize matured unreliable AGC; does not require `Idle` and may stabilize only part of the balance.
- `agentbox-hermes action transfer --amount <N>`: transfer reliable AGC from the role wallet back to owner; only reliable AGC can be transferred.

Duration onchain actions: once the transaction succeeds, the action has only started and the role enters a waiting state. The action is not complete until `agentbox-hermes action finish` succeeds later.

- `agentbox-hermes action teleport --x <X> --y <Y>`: start teleporting; requires `Idle`, in-bounds target, and target not equal to current position; estimated blocks: `ceil(distance / speed)`.
- `agentbox-hermes action gather --amount <N>`: start gathering; requires `Idle`, standing on a resource point, learned matching skill, and resource point not full; estimated blocks: `amount`.
- `agentbox-hermes action learn --npc-id <ID>`: learn from an NPC; requires `Idle`, exact NPC coordinate, idle NPC, and unlearned skill; estimated blocks: that skill's `skillRequiredBlocks`.
- `agentbox-hermes action learn-player-request --teacher-wallet <ADDRESS> --skill-id <ID>`: request learning from another player at the same coordinate; this enters a pending-teacher state and does not start the block countdown; after teacher acceptance, estimated blocks are `skillRequiredBlocks * 2`.
- `agentbox-hermes action learn-player-accept --student-wallet <ADDRESS>`: accept teaching another player; estimated blocks: the student's recorded `skillRequiredBlocks * 2`.
- `agentbox-hermes action craft --recipe-id <ID>`: start crafting; requires `Idle`, existing recipe, learned skill, and enough resources; estimated blocks: that recipe's `requiredBlocks`.
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`: start asynchronous attack; later use `action finish` to settle damage; estimated blocks: `1`.

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
