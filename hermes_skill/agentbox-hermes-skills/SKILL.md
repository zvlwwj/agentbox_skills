---
name: agentbox-hermes-skills
description: Base Agentbox gameplay skill for Hermes Agent. Uses Hermes terminal/file/skills tools to call the local agentbox-hermes CLI for signer management, multi-role owners, reads, prerequisite checks, and on-chain actions.
requires_toolsets: [terminal, file, skills]
requires_tools: [terminal, read_file]
---

# Agentbox Hermes Skills

## Purpose

This skill lets Hermes Agent manage Agentbox gameplay **without relying on the OpenClaw plugin/runtime**.

The real execution entrypoint is the local CLI:

- Preferred: `agentbox-hermes`
- Fallback if not on PATH: `~/.hermes/bin/agentbox-hermes`

Commands return JSON by default. When speaking to users, prefer semantic names rather than raw IDs.

## Local State Paths

Hermes-side Agentbox state is stored at:

- `~/.hermes/agentbox/active_signer.json`
- `~/.hermes/agentbox/active_role.json`
- `~/.hermes/agentbox/background_runner_state.json`

Rules:

- Default role resolution only uses `active_role.json`
- If there is no active role, do not guess the last owned role; fail explicitly and select one first

## Core Commands

### Signer

- `agentbox-hermes signer prepare`
- `agentbox-hermes signer import --private-key <KEY>`
- `agentbox-hermes signer export`
- `agentbox-hermes signer read`
- `agentbox-hermes registration confirm --profile-mode auto_generate`

Rules:

- If a local signer already exists, do not create/import another signer by default
- When the user asks to create a new account, reuse the existing signer by default
- Only replace the signer when the user explicitly wants to switch owners
- Before replacing a signer, remind the user to back it up and get explicit confirmation

### Multi-role owners

- `agentbox-hermes roles list-owned`
- `agentbox-hermes roles read-active`
- `agentbox-hermes roles select-active --role-wallet <ROLE_WALLET>`
- `agentbox-hermes roles clear-active`

Recommended flow:

1. `signer read`
2. `roles list-owned`
3. `roles select-active` when a default account is needed
4. Commands without `--role` then use the active role by default

### Operation management

The Operation Manager keeps a local structured operation file for the current `active roleWallet`. It records:

- Completed operations, including each action's execution time, transaction hash, and result
- The current running operation, including completed and unfinished actions
- Planned future operations, including each operation's action list

Commands:

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

For long-running background play, prefer Operation Manager state over manually maintaining a full action history in prompts or chat history:

1. Run `operations read-state`
2. If there is no current operation but planned operations exist, run `operations start-next`
3. Run `operations next-action` to get the next recommended action
4. Call the matching `agentbox-hermes action ...` write command
5. The runtime automatically records the write as completed or failed
6. If local operation state conflicts with onchain state, trust onchain state and run `operations reconcile`

### Reads

- `agentbox-hermes read role-snapshot`
- `agentbox-hermes read world-static`
- `agentbox-hermes read world-dynamic`
- `agentbox-hermes read land --x <X> --y <Y>`
- `agentbox-hermes read last-mint`
- `agentbox-hermes read global-config`

Optional source override:

- `--source auto`
- `--source chain`
- `--source indexer`

### Prerequisite checks

- `agentbox-hermes check gather --amount <N>`
- `agentbox-hermes check learn --npc-id <ID>`
- `agentbox-hermes check craft --recipe-id <ID>`
- `agentbox-hermes check finishable`
- `agentbox-hermes check trigger-mint`
- `agentbox-hermes check stabilize`

Gathering rule: each resource point supports at most `10` active gatherers at the same time. `check gather` returns this limit; if the current active gatherer count cannot be read directly, `action gather` may still revert when the resource point is already full.

### Actions

- `agentbox-hermes action move --x <X> --y <Y>`
- `agentbox-hermes action teleport --x <X> --y <Y>`
- `agentbox-hermes action learn --npc-id <ID>`
- `agentbox-hermes action gather --amount <N>`
- `agentbox-hermes action craft --recipe-id <ID>`
- `agentbox-hermes action attack --target-wallet <ADDRESS>`
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`
- `agentbox-hermes action finish`
- `agentbox-hermes action cancel`
- `agentbox-hermes action equip --equipment-id <ID>`
- `agentbox-hermes action unequip --slot <ID>`
- `agentbox-hermes action trigger-mint`
- `agentbox-hermes action stabilize`
- `agentbox-hermes action transfer --amount <N>`

## User-facing language

- Prefer semantic names such as:
  - `Blacksmith`
  - `Armor crafting`
  - `Shoes slot`
- Only include IDs in parentheses for debugging, config validation, or when the user explicitly asks for them

For example:

- Do not say: `go to npcId=4 and learn skillId=5`
- Say: `go to the Blacksmith and learn Bow crafting`

## Common workflows

### 1. First-time setup

1. `agentbox-hermes signer prepare`
2. `agentbox-hermes signer read`
3. `agentbox-hermes roles list-owned`

### 2. Switch default account

1. `agentbox-hermes roles list-owned`
2. `agentbox-hermes roles select-active --role-wallet <ROLE_WALLET>`
3. `agentbox-hermes roles read-active`

### 3. Create a new account

1. Check whether a signer already exists: `agentbox-hermes signer read`
2. If a signer exists, reuse it by default; do not prepare/import a new signer
3. Use:
   - `agentbox-hermes registration confirm --profile-mode auto_generate`
   - Registration fee must come from the current onchain `getRegistrationFee()` result. Current tiers are `0.01/0.02/0.03/0.04/0.05 ETH`, fixed at `0.05 ETH` from role `4000` onward.
4. After success, re-read:
   - `agentbox-hermes roles list-owned`
   - `agentbox-hermes roles read-active`

### 4. Safe write flow

1. Read state first
2. Run prerequisite checks
3. Execute the action
4. Re-read key state after the write

## Important boundaries

- Hermes skills are instructions; the CLI performs the real actions
- Do not assume Hermes has OpenClaw plugin tools
- Do not rely on chat history for long-running state; persist it under `~/.hermes/agentbox/`
