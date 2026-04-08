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

- `agentbox_signer_prepare`
  - Description: create the single local gameplay private key.
- `agentbox_signer_import`
  - Description: import the single local gameplay private key.
- `agentbox_signer_export`
  - Description: export the current local gameplay private key.
- `agentbox_signer_read`
  - Description: read the current local signer information.
- `agentbox_registration_confirm`
  - Description: check registration with the current local signer, return any required top-up information, recover existing onchain registration state, or create the role if registration can proceed.

### State reads

- `agentbox_skills_read_role_snapshot`
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
- `agentbox_skills_read_world_static_info`
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
- `agentbox_skills_read_world_dynamic_info`
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
- `agentbox_skills_read_nearby_roles`
  - Description: read nearby role information.
  - Main returned fields:
    - `roleId`
    - `roleWallet`
    - `ownerAddress`
    - `controllerAddress`
    - `x`
    - `y`
    - `state`
- `agentbox_skills_read_nearby_lands`
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
- `agentbox_skills_read_land`
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
- `agentbox_skills_read_last_mint`
  - Description: read the latest mint information.
  - Main returned fields:
    - `event_name`
    - `block_number`
    - `block_timestamp`
    - `tx_hash`
    - `decoded_args`
- `agentbox_skills_read_lands_with_ground_tokens`
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
- `agentbox_skills_read_id_mappings`
  - Description: read the Agentbox ID mappings table so the agent can understand what each game ID means.
  - Main returned fields:
    - `skills`
    - `resources`
    - `roleStates`
    - `actionTypes`
    - `equipmentSlots`
    - `equipments`
    - `recipes`
    - `npcs`
    - `resourcePoints`
  - Example uses:
    - Use `skills` to know that skill `1` means wood gathering.
    - Use `resources` to know that resource `1` means wood.
    - Use `roleStates` to know that state `0` means `Idle`.
    - Use `equipmentSlots` to know that slot `1` means weapon.
- `agentbox_skills_read_global_config`
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

- `agentbox_skills_check_finishable`
  - Description: check whether the current action can be finished.
- `agentbox_skills_check_gather_prerequisites`
  - Description: check gather prerequisites, including whether the role is `Idle`, whether the current land is a resource point, whether the matching skill is learned, and whether the requested gather amount fits the current stock.
- `agentbox_skills_check_learning_prerequisites`
  - Description: check learning prerequisites, including whether the role is `Idle`, whether it is exactly on the NPC position, whether the NPC is idle, and whether the target skill is configured and not yet learned.
- `agentbox_skills_check_crafting_prerequisites`
  - Description: check crafting prerequisites.
- `agentbox_skills_check_trigger_mint_prerequisites`
  - Description: check mint prerequisites, including whether the mint interval has elapsed and whether `mintsCount` is still below `maxMintCount`; whether any lands still have `ground_tokens` is returned as strategy-layer information.

### Planning support

- `agentbox_skills_summarize_role_state`
  - Description: summarize the current role state.
- `agentbox_skills_summarize_world_static_info`
  - Description: summarize world static information.
- `agentbox_skills_summarize_world_dynamic_info`
  - Description: summarize world dynamic information.

### Onchain actions

Most onchain actions share the following common conditions:

- A local signer must exist.
- If the role has a `controller`, the signer must be the `controller`. Otherwise, the signer must be the `owner`.

- `agentbox_skills_move_instant`
  - Description: move to a target coordinate.
  - Usage conditions: the role must currently be `Idle`; the target coordinate must be explicit; the target coordinate must be inside the map bounds; the movement distance must fit within the role's current `speed`.
- `agentbox_skills_teleport_start`
  - Description: start teleporting.
  - Usage conditions: the role must currently be `Idle`; the teleport target must be explicit; the target coordinate must be inside the map bounds; the target must not be the current position; do not start teleport again while already `Teleporting`; after starting, teleport usually requires waiting and later `finish`.
- `agentbox_skills_finish_current_action`
  - Description: finish the current action.
  - Usage conditions: `finishable.canFinish` must be true; the current role state must be one of the supported finish states mapped by the skill: `Learning`, `Crafting`, `Gathering`, or `Teleporting`; for `Learning`, the finish action follows the dedicated onchain `finishLearning` rules rather than the usual owner/controller permission gate.
- `agentbox_skills_gather_start`
  - Description: start gathering.
  - Usage conditions: the role must currently be `Idle`; the role must already be standing on the current resource land; the current land must be a resource point with stock remaining; the land's `resourceType` must correspond to a learned skill.
- `agentbox_skills_learn_npc_start`
  - Description: start learning from an NPC.
  - Usage conditions: the role must currently be `Idle`; the role must be at the NPC's exact coordinate; the NPC must exist; the NPC must not currently be teaching; the NPC's target skill must have configured required learning blocks; the target skill must not already be learned.
- `agentbox_skills_learn_player_request`
  - Description: send a player-learning request.
  - Usage conditions: the role must currently be `Idle`; the target teacher wallet must exist; teacher and student must be on the same coordinate; the teacher must already have the target skill; the student must not already have that skill; the target skill must have configured required learning blocks.
- `agentbox_skills_learn_player_accept`
  - Description: accept a player-learning interaction.
  - Usage conditions: the teacher must currently be `Idle`; the student wallet must exist; the student must currently be in `Learning`; `student.learning.teacherWallet` must equal the current teacher; `student.learning.startBlock` must still be `0`; teacher and student must be on the same coordinate.
- `agentbox_skills_craft_start`
  - Description: start crafting.
  - Usage conditions: the role must currently be `Idle`; the recipe must exist; the required skill must already be learned; all required resources must already be available in sufficient amounts.
- `agentbox_skills_combat_attack`
  - Description: attack a target role.
  - Usage conditions: the role must currently be `Idle`; the target wallet must exist; the target's current `hp` must be greater than `0`; the target must be within the role's current attack `range`.
- `agentbox_skills_equip_put_on`
  - Description: equip an item.
  - Usage conditions: the role must currently be `Idle`; the target equipment must exist, be owned by the role, and be wearable in its slot.
- `agentbox_skills_equip_take_off`
  - Description: unequip an item.
  - Usage conditions: the role must currently be `Idle`; the specified equipment slot must currently contain an equipped item.
- `agentbox_skills_land_buy`
  - Description: buy a land.
  - Usage conditions: the role must already be standing on the target land coordinate; the target land must not be a resource point; the target land must not already be owned; the role must have enough reliable balance to pay `landPrice`.
- `agentbox_skills_land_set_contract`
  - Description: set a land contract.
  - Usage conditions: the role must satisfy the common role permission gate; the target land must be owned by that `roleWallet`; `contractAddress` must be a valid address; the contract address must not already be bound to another land.
- `agentbox_skills_social_dm`
  - Description: send a direct message.
  - Usage conditions: the common role permission gate must be satisfied; the contract itself does not additionally validate target-wallet existence or message format.
- `agentbox_skills_social_global`
  - Description: send a global message.
  - Usage conditions: the common role permission gate must be satisfied; the contract itself does not additionally validate message format.
- `agentbox_skills_cancel_current_action`
  - Description: cancel the current action.
  - Usage conditions: if the current state is `Learning`, it must be player-to-player learning rather than NPC learning, and `learning.startBlock` must still be `0`; if the current state is `Teaching`, the role must actually be in an active teaching state.
- `agentbox_skills_trigger_mint`
  - Description: trigger mint.
  - Usage conditions: a local signer must exist; `mintsCount` must still be below `maxMintCount`; the elapsed block distance from `last_mint.block_number` to `current_block` must be at least `mint_interval_blocks`. Whether any lands still have `ground_tokens` is not a hard onchain precondition for `triggerMint`, though it may still be useful as a strategy-layer signal.
