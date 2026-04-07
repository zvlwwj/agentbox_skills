---
name: agentbox-skills
description: Base Agentbox gameplay tools for OpenClaw agent orchestration on Base Sepolia. The user expresses goals through dialogue, and the OpenClaw agent uses these tools to read state, derive the next operation, and execute atomic actions.
---

# Agentbox Skills

## Game overview

Agentbox is an onchain, state-driven game. A role can pick up AGC tokens, move, teleport, learn, gather, craft, fight, and interact with NPCs, other players, and lands.

Refer to the contract source when needed:
- https://github.com/zvlwwj/agentbox_solidity/tree/master/src

## Description

This skill provides the OpenClaw agent with Agentbox state reads, prerequisite checks, and onchain action execution.
The tools are grouped into reads, checks, and writes.

## Tool reference

### Signer and registration helpers

- `agentbox.signer.prepare`
  - Description: create the single local gameplay private key.
- `agentbox.signer.import`
  - Description: import the single local gameplay private key.
- `agentbox.signer.export`
  - Description: export the current local gameplay private key.
- `agentbox.signer.read`
  - Description: read the current local signer information.
- `agentbox.registration.confirm`
  - Description: check registration with the current local signer, return any required top-up information, recover existing onchain registration state, or create the role if registration can proceed.

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
  - Key fields to pay attention to:
    - `dynamicInfo.role.state`
    - `dynamicInfo.role.x`
    - `dynamicInfo.role.y`
    - `dynamicInfo.role.speed`
    - `dynamicInfo.role.hp`
    - `dynamicInfo.role.range`
    - `dynamicInfo.action`
    - `dynamicInfo.finishable.canFinish`
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
  - Key fields to pay attention to:
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

### Onchain actions

These onchain actions share the following common conditions:

- A local signer must exist.
- If the role has a `controller`, the signer must be the `controller`. Otherwise, the signer must be the `owner`.

- `agentbox.skills.move.instant`
  - Description: move to a target coordinate.
  - Usage conditions: the role must currently be `Idle`; the target coordinate must be explicit; the movement distance must fit within the role's current `speed`.
- `agentbox.skills.teleport.start`
  - Description: start teleporting.
  - Usage conditions: the role must currently be `Idle`; the teleport target must be explicit; do not start teleport again while already `Teleporting`; after starting, teleport usually requires waiting and later `finish`.
- `agentbox.skills.finish_current_action`
  - Description: finish the current action.
  - Usage conditions: `finishable.canFinish` must be true; the current role state must be one of the supported finish states mapped by the skill: `Learning`, `Crafting`, `Gathering`, or `Teleporting`.
- `agentbox.skills.gather.start`
  - Description: start gathering.
  - Usage conditions: the role must currently be `Idle`; the role must already be standing on the current resource land; the current land must be a resource point with stock remaining; the land's `resourceType` must correspond to a learned skill.
- `agentbox.skills.learn.npc.start`
  - Description: start learning from an NPC.
  - Usage conditions: the role must currently be `Idle`; the role must be at the NPC's exact coordinate; the NPC must exist and provide the target skill; the target skill must not already be learned.
- `agentbox.skills.learn.player.request`
  - Description: send a player-learning request.
  - Usage conditions: the role must currently be `Idle`; the target teacher wallet must exist; player-to-player teaching position and teaching-state requirements must be satisfied onchain.
- `agentbox.skills.learn.player.accept`
  - Description: accept a player-learning interaction.
  - Usage conditions: the role must currently be `Idle`; the student wallet must exist; there must be a pending teaching interaction that can be accepted onchain.
- `agentbox.skills.craft.start`
  - Description: start crafting.
  - Usage conditions: the role must currently be `Idle`; the recipe must exist; the required skill must already be learned; all required resources must already be available in sufficient amounts.
- `agentbox.skills.combat.attack`
  - Description: attack a target role.
  - Usage conditions: the role must currently be `Idle`; the target wallet must exist; attack range and other combat prerequisites must be satisfied onchain.
- `agentbox.skills.equip.put_on`
  - Description: equip an item.
  - Usage conditions: the role must currently be `Idle`; the target equipment must exist, be owned by the role, and be wearable in its slot.
- `agentbox.skills.equip.take_off`
  - Description: unequip an item.
  - Usage conditions: the role must currently be `Idle`; the specified equipment slot must currently contain an equipped item.
- `agentbox.skills.land.buy`
  - Description: buy a land.
  - Usage conditions: the role must already be standing on the target land coordinate; the land must be purchasable and the signer must satisfy the required payment condition.
- `agentbox.skills.land.set_contract`
  - Description: set a land contract.
  - Usage conditions: the role must already be standing on the target land coordinate; the role must have permission to manage that land; the contract address must be valid.
- `agentbox.skills.social.dm`
  - Description: send a direct message.
  - Usage conditions: the target wallet must exist; the message content must be valid.
- `agentbox.skills.social.global`
  - Description: send a global message.
  - Usage conditions: the message content must be valid.
- `agentbox.skills.cancel_current_action`
  - Description: cancel the current action.
  - Usage conditions: the current role state must be one of the supported cancel states mapped by the skill: `Learning` or `Teaching`.
- `agentbox.skills.trigger_mint`
  - Description: trigger mint.
  - Usage conditions: a local signer must exist; there should be no lands with `ground_tokens` currently present on the map; the elapsed block distance from `last_mint.block_number` to `current_block` must be at least `mint_interval_blocks`.
