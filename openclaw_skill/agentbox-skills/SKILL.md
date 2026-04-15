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
If a tool omits the `role` parameter, it now uses the locally stored `active roleWallet`; it no longer guesses the owner's last role automatically.

## Common ID semantics

Use the following built-in meanings when reading Agentbox data.

### Skills

- `1`: Woodcutting, wood gathering, related `resourceType = 1`
- `2`: Husbandry, wool gathering, related `resourceType = 2`
- `3`: Mining, stone gathering, related `resourceType = 3`
- `4`: Bow crafting
- `5`: Armor crafting
- `6`: Shoes crafting

### Resources

- `1`: wood
- `2`: wool
- `3`: stone

### Role states

- `0`: `Idle`, no active timed action
- `1`: `Learning`, learning from NPC or another player
- `2`: `Teaching`, teaching another player
- `3`: `Crafting`, currently crafting
- `4`: `Gathering`, currently gathering
- `5`: `Teleporting`, teleport started and waiting to finish
- `6`: `PendingSpawn`, waiting for VRF spawn result

### Equipment slots

- `1`: Weapon slot
- `2`: Armor slot
- `3`: Shoes slot

### Equipments

- `1001`: Bow, slot `1`, `+20 ATK, +1 RNG`
- `1002`: Armor, slot `2`, `+20 DEF, +20 HP`
- `1003`: Shoes, slot `3`

### Recipes

- `1`: Bow crafting recipe, requires `skillId = 4`, outputs `equipmentId = 1001`
- `2`: Armor crafting recipe, requires `skillId = 5`, outputs `equipmentId = 1002`
- `3`: Shoes crafting recipe, requires `skillId = 6`, outputs `equipmentId = 1003`

### NPCs

- `1`: Lumberjack, teaches `skillId = 1`
- `2`: Shepherd, teaches `skillId = 2`
- `3`: Miner, teaches `skillId = 3`
- `4`: Bow crafting teacher, teaches `skillId = 4`
- `5`: Armor crafting teacher, teaches `skillId = 5`
- `6`: Shoes crafting teacher, teaches `skillId = 6`

## Tool reference

### Signer and registration helpers

- `agentbox_signer_prepare`
  - Description: create the single local gameplay private key. By default this does not overwrite an existing local signer; only pass `force=true` when you explicitly want to switch to a different owner signer.
  - Safety requirement: if a local signer already exists, the agent must first remind the user to export and back up the private key, then obtain explicit confirmation before any signer-replacing action is attempted.
- `agentbox_signer_import`
  - Description: import the single local gameplay private key. By default this does not overwrite an existing local signer; only pass `force=true` when you explicitly want to switch to a different owner signer.
  - Safety requirement: if a local signer already exists, the agent must first remind the user to export and back up the private key, then obtain explicit confirmation before any signer-replacing action is attempted.
- `agentbox_signer_export`
  - Description: export the current local gameplay private key.
- `agentbox_signer_read`
  - Description: read the current local signer information, the number of roles owned by that owner, and the current active role.
- `agentbox_registration_confirm`
  - Description: check registration with the current local signer. If the current active role is still in `PendingSpawn`, recover that registration flow; otherwise allow the same owner to create another role when registration can proceed. Newly created roles automatically become the active role.
- `agentbox_roles_list_owned`
  - Description: list all game roles owned by the current active signer owner address.
- `agentbox_roles_read_active`
  - Description: read the current active role and whether it is still owned by the active signer.
- `agentbox_roles_select_active`
  - Description: select the current active role by `roleWallet` or `roleId`. When `role` is omitted later, gameplay tools default to this role.
- `agentbox_roles_clear_active`
  - Description: clear the current active role. After clearing, any gameplay tool that omits `role` will fail until a new active role is selected.

### Multi-role owner flow

- Prepare or import the local signer.
- Call `agentbox_roles_list_owned` to inspect every role owned by the current owner.
- Call `agentbox_roles_select_active` to choose the default `roleWallet` for this session.
- After that, gameplay tools that omit `role` act on the active role.
- To switch accounts, call `agentbox_roles_select_active` again.
- If the same owner creates another role, `agentbox_registration_confirm` automatically makes the new role the active role.
- When the user asks to create a new game account and a local signer already exists, reuse that signer and call `agentbox_registration_confirm` directly. Do not create or import another signer unless the user explicitly wants to switch owners.
- When the user asks to delete, replace, or reset the local signer, first warn them to back up the private key and obtain explicit confirmation before any signer-replacing action is allowed.

### State reads

- `agentbox_skills_read_role_snapshot`
  - Description: read the full current role snapshot.
  - Optional parameter: `source`
    - `auto`: default, prefer indexer and fall back to chain.
    - `chain`: force pure onchain role data; useful when verifying whether state has actually changed.
    - `indexer`: force indexer-backed reads.
  - Core returned structure:
    - `staticInfo`
    - `dynamicInfo`
  - Focus on:
    - `dynamicInfo.role.state`
    - `dynamicInfo.role.x`
    - `dynamicInfo.role.y`
    - `dynamicInfo.action`
    - `dynamicInfo.finishable.canFinish`
- `agentbox_skills_read_world_static_info`
  - Description: read relatively static world information.
  - Optional parameter: `source`
    - `auto`: default.
    - `chain`: return only fields that can be read directly from chain where possible; indexer-only fields will remain empty.
    - `indexer`: prefer richer indexer-backed world data.
  - Core returned structure:
    - world coordinate convention and base config
    - NPC, recipe, equipment, and resource-land catalogs
    - current equipment and related crafting paths
- `agentbox_skills_read_world_dynamic_info`
  - Description: read dynamic world information.
  - Optional parameter: `source`
    - `auto`: default.
    - `chain`: return only fields that can be read directly from chain where possible; for example `current_block` and `current_land` are available, but `nearby_roles`, `nearby_lands`, `lands_with_ground_tokens`, and `last_mint` may be empty because they depend on the indexer.
    - `indexer`: prefer richer indexer-backed world data.
  - Core returned structure:
    - current block and current land
    - nearby roles and nearby lands
    - ground-AGC and recent mint signals
  - Focus on:
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `lands_with_ground_tokens`
- `agentbox_skills_read_nearby_roles`
  - Description: read nearby role information.
  - Optional parameter: `source`
    - `auto`: default.
    - `chain`: there is currently no pure onchain nearby-role enumeration, so this usually returns an empty list.
    - `indexer`: return the indexer-backed nearby-role list.
  - Core returned structure:
    - nearby role identity
    - coordinates
    - current state
- `agentbox_skills_read_nearby_lands`
  - Description: read nearby land information.
  - Optional parameter: `source`
    - `auto`: default.
    - `chain`: there is currently no pure onchain nearby-land enumeration, so this usually returns an empty list.
    - `indexer`: return the indexer-backed nearby-land list.
  - Core returned structure:
    - coordinate information
    - ownership and land configuration
    - resource-point and ground-AGC information
- `agentbox_skills_read_land`
  - Description: read detailed information for a specific land.
  - Core returned structure:
    - coordinate information
    - ownership and land configuration
    - resource-point and ground-AGC information
- `agentbox_skills_read_last_mint`
  - Description: read the latest mint information.
  - Core returned structure:
    - event metadata
    - decoded mint arguments
    - decoded mint coordinates
- `agentbox_skills_read_lands_with_ground_tokens`
  - Description: read lands with `ground_tokens`.
  - Core returned structure:
    - coordinate information
    - ownership and land configuration
    - ground-AGC information
  - Coordinate convention:
    - Coordinates are always ordered as `(x, y)`.
    - `landId` is computed as `landId = y * mapWidth + x`.
    - Do not infer `x` and `y` by visually splitting the digits of `landId`.
- `agentbox_skills_read_global_config`
  - Description: read global configuration.
  - Core returned structure:
    - map dimensions
    - timing config for mint, stabilization, and crafting
    - economy config such as land price

### Prerequisite checks

- `agentbox_skills_check_finishable`
  - Description: check whether the current action can be finished.
- `agentbox_skills_check_gather_prerequisites`
  - Description: check gather prerequisites, including whether the role is `Idle`, whether the current land is a resource point, whether the matching skill is learned, and whether the requested gather amount is positive.
- `agentbox_skills_check_learning_prerequisites`
  - Description: check learning prerequisites, including whether the role is `Idle`, whether it is exactly on the NPC position, whether the NPC is idle, and whether the target skill is configured and not yet learned.
- `agentbox_skills_check_crafting_prerequisites`
  - Description: check crafting prerequisites.
- `agentbox_skills_check_trigger_mint_prerequisites`
  - Description: check mint prerequisites, including whether the mint interval has elapsed and whether `mintsCount` is still below `maxMintCount`; whether any lands still have `ground_tokens` is returned as strategy-layer information.
- `agentbox_skills_check_stabilize_prerequisites`
  - Description: check whether the role currently has unreliable AGC balance worth attempting to stabilize.
  - Core returned structure:
    - whether execution is possible
    - current balance breakdown
    - stabilization timing information
    - failure reasons
  - Notes:
    - The economy contract exposes only aggregated `unreliableBalance`, not per-bucket maturity timestamps.
    - So this check answers “does the role currently have unreliable balance worth attempting to stabilize,” not “how much is guaranteed to mature in this exact block.”

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
  - Usage conditions: the role must currently be `Idle`; the role must already be standing on the current resource land; the current land must be a resource point; the land's `resourceType` must correspond to a learned skill.
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
- `agentbox_skills_stabilize_balance`
  - Description: attempt to stabilize matured unreliable AGC held by the role wallet.
  - Usage conditions: a local signer must exist; if the role has a `controller`, the signer must be the `controller`; otherwise the signer must be the `owner`; the role should have `unreliableBalance > 0`, otherwise calling it is not useful.
  - Notes:
    - `stabilizeBalance(roleWallet)` is an economy-contract action and does not require the role to be `Idle`.
    - Because the chain does not expose maturity timestamps for each unreliable-balance bucket, a successful call may stabilize only part of the unreliable balance, or may produce no effective change if nothing is mature yet in the current block.
- `agentbox_skills_transfer_agc_to_owner`
  - Description: transfer stabilized, spendable AGC from the role wallet back to the current owner address.
  - Usage conditions: a local signer must exist; if the role has a `controller`, the signer must be the `controller`; otherwise the signer must be the `owner`; `amount` must be greater than `0`; the role wallet must currently have enough `reliableBalance`.
  - Notes:
    - This action uses `AgentboxRoleWallet.execute(...)` so that the role wallet calls the economy contract's ERC20 `transfer(owner, amount)`.
    - Only stabilized, spendable reliable AGC can be transferred out; unreliable AGC cannot be transferred directly.
