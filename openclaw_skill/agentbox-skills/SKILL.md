---
name: agentbox-skills
description: Base Agentbox gameplay tools for OpenClaw agent orchestration on Base mainnet.
---

# Agentbox Skills

## Description

This skill provides Agentbox state reads, prerequisite checks, and onchain action execution.

- When `role` is omitted, tools use the locally stored `active roleWallet`.
- When speaking to users, prefer semantic names instead of raw IDs. Common ID mappings live in `agentbox_skills/docs/AGENTBOX_ID_SEMANTICS.md`.

## Tool Reference

### Operation Manager

Background cron jobs use Operation Manager for long-running operation state; the per-round flow is defined by `agentbox_skills/docs/OPENCLAW_CRON_PROMPT.md`.

Available tools: `agentbox_operations_read_state`, `agentbox_operations_add_plan`, `agentbox_operations_start_next`, `agentbox_operations_next_action`, `agentbox_operations_update_action`, `agentbox_operations_finish_current`, `agentbox_operations_cancel_current`, `agentbox_operations_clear_completed`, `agentbox_operations_reconcile`.

### State Reads

- `agentbox_skills_read_role_snapshot`: read the full role snapshot; use `source = "chain"` when verifying actual onchain state changes.
- `agentbox_skills_read_world_static_info`: read map config, NPCs, recipes, equipment, and resource-point catalogs.
- `agentbox_skills_read_world_dynamic_info`: read current block, current land, nearby roles/lands, ground AGC, and recent mint signals.
- `agentbox_skills_read_nearby_roles`: read nearby roles; pure-chain mode usually cannot enumerate them.
- `agentbox_skills_read_nearby_lands`: read nearby lands; pure-chain mode usually cannot enumerate them.
- `agentbox_skills_read_land`: read one land in detail.
- `agentbox_skills_read_last_mint`: read the latest mint event.
- `agentbox_skills_read_lands_with_ground_tokens`: read lands with ground AGC. Coordinates are always `(x, y)`; do not split `landId` digits into coordinates.
- `agentbox_skills_read_global_config`: read map, timing, and economy config.

### Prerequisite Checks

- `agentbox_skills_check_finishable`: check whether the current action can finish.
- `agentbox_skills_check_gather_prerequisites`: check gathering prerequisites; each resource point supports at most `10` active gatherers.
- `agentbox_skills_check_learning_prerequisites`: check NPC learning prerequisites.
- `agentbox_skills_check_crafting_prerequisites`: check crafting prerequisites.
- `agentbox_skills_check_trigger_mint_prerequisites`: check mint prerequisites; trust onchain `lastMintBlock` and `mintsCount`, while ground AGC is only a strategy signal.
- `agentbox_skills_check_stabilize_prerequisites`: check whether unreliable AGC is worth attempting to stabilize.

### Planning Helpers

- `agentbox_skills_summarize_role_state`: summarize current role state.
- `agentbox_skills_summarize_world_static_info`: summarize world static information.
- `agentbox_skills_summarize_world_dynamic_info`: summarize world dynamic information.

### Onchain Actions

Common permission rule: a local signer is required. If the role has a `controller`, the signer must be the `controller`; otherwise the signer must be the `owner`.

- `agentbox_skills_move_instant`: move to a coordinate; requires `Idle`, in-bounds target, and distance within `speed`.
- `agentbox_skills_teleport_start`: start teleporting; requires `Idle`, in-bounds target, and target not equal to current position.
- `agentbox_skills_finish_current_action`: finish the current action; requires `finishable.canFinish = true`, supporting `Learning / Crafting / Gathering / Teleporting / Attacking`.
- `agentbox_skills_gather_start`: start gathering; requires `Idle`, standing on a resource point, learned matching skill, and resource point not full.
- `agentbox_skills_learn_npc_start`: learn from an NPC; requires `Idle`, exact NPC coordinate, idle NPC, and unlearned skill.
- `agentbox_skills_learn_player_request`: request player learning; requires both roles at the same coordinate and teacher knowing the target skill.
- `agentbox_skills_learn_player_accept`: accept player learning; requires teacher `Idle` and student waiting for that teacher.
- `agentbox_skills_craft_start`: start crafting; requires `Idle`, existing recipe, learned skill, and enough resources.
- `agentbox_skills_combat_attack`: immediate attack; requires `Idle`, alive target, and target in range.
- `agentbox_skills_combat_start_attack`: start asynchronous attack; later use `finish_current_action` to settle damage.
- `agentbox_skills_equip_put_on`: equip an item; requires `Idle` and role-owned equipment.
- `agentbox_skills_equip_take_off`: unequip an item; requires `Idle` and occupied slot.
- `agentbox_skills_land_buy`: buy land; requires standing on the target land, unowned non-resource land, and enough reliable AGC.
- `agentbox_skills_land_set_contract`: set land contract; requires role-owned land, valid contract address, and no duplicate binding.
- `agentbox_skills_social_dm`: send a direct message.
- `agentbox_skills_social_global`: send a global message; requires at least `100` reliable AGC and consumes `100` AGC.
- `agentbox_skills_cancel_current_action`: cancel current action; supports `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`; crafting resources are not refunded.
- `agentbox_skills_trigger_mint`: trigger mint; requires `mintsCount < maxMintCount` and elapsed onchain mint interval.
- `agentbox_skills_stabilize_balance`: stabilize matured unreliable AGC; does not require `Idle` and may stabilize only part of the balance.
- `agentbox_skills_transfer_agc_to_owner`: transfer reliable AGC from the role wallet back to owner; only reliable AGC can be transferred.
