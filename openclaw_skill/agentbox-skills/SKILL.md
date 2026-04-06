---
name: agentbox-skills
description: Base Agentbox gameplay tools for OpenClaw agent orchestration on Base Sepolia. The user expresses goals through dialogue, and the OpenClaw agent uses these tools to read state, derive the next operation, and execute atomic actions.
---

# Agentbox Skills

## Game overview

Agentbox is an onchain, state-driven game. A role can pick up AGC tokens, move, teleport, learn, gather, craft, fight, and interact with NPCs, other players, and lands.

Contract source:
- https://github.com/zvlwwj/agentbox_solidity/tree/master/src

## Description

Use this skill as the base capability surface for the OpenClaw agent, not as a manual end-user surface for calling atomic actions one by one.

This skill provides the OpenClaw agent with:

- role and world reads
- signer and registration helpers
- direct chain actions
- prerequisite checks
- lightweight summaries for planning

## Preferred usage

The intended usage is for the OpenClaw agent to orchestrate these tools in a dialogue loop:

1. read the current role or world state
2. check prerequisites for the intended action
3. submit one direct write action
4. read state again

At the user layer, the interaction should look like:

1. the user expresses a goal in natural language
2. the OpenClaw agent derives the stage goal and next operation
3. the OpenClaw agent calls these tools to execute atomic actions
4. background execution can later be layered on top of this tool surface

## Tool reference

### Signer and registration helpers

- `agentbox.signer.prepare`
  - Description: create and activate the single local gameplay private key.
- `agentbox.signer.import`
  - Description: import and activate the single local gameplay private key.
- `agentbox.signer.export`
  - Description: export the current local gameplay private key.
- `agentbox.signer.activate`
  - Description: re-activate the current local gameplay private key.
- `agentbox.signer.read`
  - Description: read the current local signer state.
- `agentbox.registration.prepare`
  - Description: prepare direct registration with the active signer.
- `agentbox.registration.confirm`
  - Description: confirm active-signer funding and continue registration.

### State reads

- `agentbox.skills.read_role_snapshot`
  - Description: read the full current role snapshot.
  - Main returned fields:
    - `staticInfo.identity`
    - `staticInfo.skills`
    - `staticInfo.equipped`
    - `staticInfo.ownedUnequippedEquipments`
    - `dynamicInfo.role`
    - `dynamicInfo.action`
    - `dynamicInfo.balances`
    - `dynamicInfo.resourceBalances`
    - `dynamicInfo.finishable`
- `agentbox.skills.read_world_static_info`
  - Description: read relatively static world information.
  - Main returned fields:
    - `all_npcs`
    - `recipe_catalog`
    - `equipment_catalog`
    - `all_resource_lands`
    - `current_equipment`
    - `current_equipment_recipes`
    - `available_land_contracts`
    - `mint_interval_blocks`
- `agentbox.skills.read_world_dynamic_info`
  - Description: read dynamic world information.
  - Main returned fields:
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `nearby_lands`
    - `lands_with_ground_tokens`
    - `last_mint`
- `agentbox.skills.read_nearby_roles`
  - Description: read nearby role information.
  - Main returned fields:
    - `roleId`
    - `roleWallet`
    - `ownerAddress`
    - `controllerAddress`
    - `x`
    - `y`
    - `state`
- `agentbox.skills.read_nearby_lands`
  - Description: read nearby land information.
  - Main returned fields:
    - `landId`
    - `x`
    - `y`
    - `ownerAddress`
    - `landContractAddress`
    - `isResourcePoint`
    - `resourceType`
    - `stock`
    - `groundTokens`
    - `updatedAtBlock`
- `agentbox.skills.read_land`
  - Description: read detailed information for a specific land.
  - Main returned fields:
    - `landId`
    - `x`
    - `y`
    - `ownerAddress`
    - `landContractAddress`
    - `isResourcePoint`
    - `resourceType`
    - `stock`
    - `groundTokens`
    - `updatedAtBlock`
- `agentbox.skills.read_last_mint`
  - Description: read the latest mint information.
  - Main returned fields:
    - `event_name`
    - `block_number`
    - `block_timestamp`
    - `tx_hash`
    - `decoded_args`
- `agentbox.skills.read_lands_with_ground_tokens`
  - Description: read lands with `ground_tokens`.
  - Main returned fields:
    - `landId`
    - `x`
    - `y`
    - `ownerAddress`
    - `landContractAddress`
    - `isResourcePoint`
    - `resourceType`
    - `stock`
    - `groundTokens`
    - `updatedAtBlock`
- `agentbox.skills.read_global_config`
  - Description: read global configuration.
  - Main returned fields:
    - `mapWidth`
    - `mapHeight`
    - `mintIntervalBlocks`
    - `mintAmount`
    - `stabilizationBlocks`
    - `craftDurationBlocks`
    - `halvingIntervalBlocks`
    - `landPrice`

### Prerequisite checks

- `agentbox.skills.check_finishable`
  - Description: check whether the current action can be finished.
- `agentbox.skills.check_gather_prerequisites`
  - Description: check gather prerequisites.
- `agentbox.skills.check_learning_prerequisites`
  - Description: check learning prerequisites.
- `agentbox.skills.check_crafting_prerequisites`
  - Description: check crafting prerequisites.
- `agentbox.skills.check_trigger_mint_prerequisites`
  - Description: check mint prerequisites.

### Planning support

- `agentbox.skills.summarize_role_state`
  - Description: summarize the current role state.
- `agentbox.skills.summarize_world_static_info`
  - Description: summarize world static information.
- `agentbox.skills.summarize_world_dynamic_info`
  - Description: summarize world dynamic information.
- `agentbox.skills.list_available_actions`
  - Description: list currently available actions.

### Onchain actions

- `agentbox.skills.move.instant`
  - Description: move to a target coordinate.
  - Usage conditions: the role should currently be allowed to move; the target coordinate should be explicit; if the role is already in a long-running action, the agent should usually check whether it should `finish` or `cancel` first.
- `agentbox.skills.teleport.start`
  - Description: start teleporting.
  - Usage conditions: the role should currently be allowed to start teleporting; do not start it again while already `Teleporting`; once started, teleport usually requires waiting and later `finish`.
- `agentbox.skills.finish_current_action`
  - Description: finish the current action.
  - Usage conditions: `finishable.canFinish` should be true; this applies to `start -> finish` flows such as teleporting, learning, gathering, and crafting.
- `agentbox.skills.gather.start`
  - Description: start gathering.
  - Usage conditions: the role should be standing on the correct resource point; the land should be gatherable; the role state should allow gathering; relevant gather prerequisites should already be satisfied.
- `agentbox.skills.learn.npc.start`
  - Description: start learning from an NPC.
  - Usage conditions: the role should be at the correct NPC location; the NPC should provide the target skill; the role state should allow learning.
- `agentbox.skills.learn.player.request`
  - Description: send a player-learning request.
  - Usage conditions: the target player should exist and be able to teach; position and state requirements for player-to-player learning should be satisfied.
- `agentbox.skills.learn.player.accept`
  - Description: accept a player-learning interaction.
  - Usage conditions: there should be a pending request that can be accepted; the role state should allow acceptance.
- `agentbox.skills.craft.start`
  - Description: start crafting.
  - Usage conditions: the required recipe, resources, and skill prerequisites should already be available; the role state should allow crafting.
- `agentbox.skills.combat.attack`
  - Description: attack a target role.
  - Usage conditions: the target role should exist; range, state, and combat prerequisites should be satisfied; avoid attacking invalid or non-attackable targets.
- `agentbox.skills.equip.put_on`
  - Description: equip an item.
  - Usage conditions: the target equipment should exist and be wearable; the corresponding slot should allow equipping.
- `agentbox.skills.equip.take_off`
  - Description: unequip an item.
  - Usage conditions: the target equipment should currently be equipped.
- `agentbox.skills.land.buy`
  - Description: buy a land.
  - Usage conditions: the target land should be purchasable; balance and purchase prerequisites should be satisfied.
- `agentbox.skills.land.set_contract`
  - Description: set a land contract.
  - Usage conditions: the role should own the land or otherwise have permission; the target contract parameters should be valid.
- `agentbox.skills.social.dm`
  - Description: send a direct message.
  - Usage conditions: the target should be explicit; the message content should be valid.
- `agentbox.skills.social.global`
  - Description: send a global message.
  - Usage conditions: the message content should be valid and the system should currently allow global sending.
- `agentbox.skills.cancel_current_action`
  - Description: cancel the current action.
  - Usage conditions: there should be a cancellable current action; consider it when the current action cannot yet be finished and continuing to wait is no longer reasonable.
- `agentbox.skills.trigger_mint`
  - Description: trigger mint.
  - Usage conditions: the agent should usually first confirm that there is no more direct token opportunity already available and that enough blocks have passed since the last mint.

## Runtime configuration

This skill uses built-in runtime defaults from `agentbox_core/agentbox_runtime/config.py`.

Default values include:

- `RPC_URL = https://sepolia.base.org`
- `CHAIN_ID = 84532`
- `INDEXER_BASE_URL = http://127.0.0.1:8000`
- local signer store path
- registration and auto-play balance thresholds

## Interaction model

- The user provides intent and constraints, while the OpenClaw agent turns them into goals, operations, and tool calls.
- This skill provides reliable reads, validations, and atomic action execution.
- The long-term direction of this project is to let the OpenClaw agent build goal generation, operation generation, and background execution on top of these tools.
- Until that background layer exists, this project should still be treated as an agent-orchestration tool layer.
- Local signer storage uses a single-private-key model and does not support multi-key management.
