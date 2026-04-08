---
name: agentbox-skills
description: 面向 OpenClaw agent 编排的 Agentbox 基础玩法工具集，运行在 Base Sepolia 上。用户通过与 OpenClaw 对话表达目标，OpenClaw agent 再调用这些工具读取状态、生成下一步操作并执行。
---

# Agentbox Skills

## 游戏简介

Agentbox 是一个运行在链上的状态驱动游戏。角色可以在地图上拾取AGC代币、移动、传送、学习、采集、制作、战斗，并与 NPC、其他玩家和地块交互。

必要时可参考合约源码：
- https://github.com/zvlwwj/agentbox_solidity/tree/master/src

## Skill描述

这个 skill 为 OpenClaw agent 提供 Agentbox 的状态读取、前置条件检查和链上动作执行能力。
工具分为读取、检查和写操作三类。

## 主要工具说明

### Signer与注册辅助

- `agentbox_signer_prepare`
  - 描述：创建本地单个 gameplay 私钥。
- `agentbox_signer_import`
  - 描述：导入本地单个 gameplay 私钥。
- `agentbox_signer_export`
  - 描述：导出当前本地 gameplay 私钥。
- `agentbox_signer_read`
  - 描述：读取当前本地 signer 信息。
- `agentbox_registration_confirm`
  - 描述：使用当前本地 signer 检查注册状态，返回所需充值信息，恢复已有链上注册状态，或在条件满足时直接完成注册。

### 状态读取

- `agentbox_skills_read_role_snapshot`
  - 描述：读取角色当前完整快照。
  - 返回的主要信息：
    - `staticInfo.identity`
    - `staticInfo.skills`
    - `staticInfo.equipped`
    - `staticInfo.ownedUnequippedEquipments`
    - `dynamicInfo.role`
    - `dynamicInfo.action`
    - `dynamicInfo.balances`
    - `dynamicInfo.resourceBalances`
    - `dynamicInfo.finishable`
  - 需要重点关注的字段：
    - `dynamicInfo.role.state`
    - `dynamicInfo.role.x`
    - `dynamicInfo.role.y`
    - `dynamicInfo.role.speed`
    - `dynamicInfo.role.hp`
    - `dynamicInfo.role.range`
    - `dynamicInfo.action`
    - `dynamicInfo.finishable.canFinish`
- `agentbox_skills_read_world_static_info`
  - 描述：读取世界中的相对静态信息。
  - 返回的主要信息：
    - `all_npcs`
    - `recipe_catalog`
    - `equipment_catalog`
    - `all_resource_lands`
    - `current_equipment`
    - `current_equipment_recipes`
    - `available_land_contracts`
    - `mint_interval_blocks`
- `agentbox_skills_read_world_dynamic_info`
  - 描述：读取世界中的动态信息。
  - 返回的主要信息：
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `nearby_lands`
    - `lands_with_ground_tokens`
    - `last_mint`
  - 需要重点关注的字段：
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `nearby_lands`
    - `lands_with_ground_tokens`
    - `last_mint`
- `agentbox_skills_read_nearby_roles`
  - 描述：读取附近角色信息。
  - 返回的主要信息：
    - `roleId`
    - `roleWallet`
    - `ownerAddress`
    - `controllerAddress`
    - `x`
    - `y`
    - `state`
- `agentbox_skills_read_nearby_lands`
  - 描述：读取附近地块信息。
  - 返回的主要信息：
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
  - 描述：读取指定地块的详细信息。
  - 返回的主要信息：
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
  - 描述：读取最近一次 mint 信息。
  - 返回的主要信息：
    - `event_name`
    - `block_number`
    - `block_timestamp`
    - `tx_hash`
    - `decoded_args`
- `agentbox_skills_read_lands_with_ground_tokens`
  - 描述：读取带有 `ground_tokens` 的土地列表。
  - 返回的主要信息：
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
  - 描述：读取 Agentbox 的 ID 映射表，帮助 agent 理解各类 ID 在游戏中的具体含义。
  - 返回的主要信息：
    - `skills`
    - `resources`
    - `roleStates`
    - `actionTypes`
    - `equipmentSlots`
    - `equipments`
    - `recipes`
    - `npcs`
    - `resourcePoints`
  - 用途示例：
    - 通过 `skills` 知道 `1` 对应木材收集技能。
    - 通过 `resources` 知道 `1` 对应木材资源。
    - 通过 `roleStates` 知道 `0` 对应 `Idle`。
    - 通过 `equipmentSlots` 知道 `1` 对应武器槽位。
- `agentbox_skills_read_global_config`
  - 描述：读取全局配置。
  - 返回的主要信息：
    - `mapWidth`
    - `mapHeight`
    - `mintIntervalBlocks`
    - `mintAmount`
    - `stabilizationBlocks`
    - `craftDurationBlocks`
    - `halvingIntervalBlocks`
    - `landPrice`

### 前置条件检查

- `agentbox_skills_check_finishable`
  - 描述：检查当前动作是否可 `finish`。
- `agentbox_skills_check_gather_prerequisites`
  - 描述：检查是否满足采集前置条件，包括角色是否处于 `Idle`、当前地块是否为资源点、对应技能是否已学会，以及请求采集数量是否不超过当前库存。
- `agentbox_skills_check_learning_prerequisites`
  - 描述：检查是否满足学习前置条件，包括角色是否处于 `Idle`、是否位于 NPC 精确坐标、NPC 是否空闲，以及目标技能是否已配置学习时长且尚未学会。
- `agentbox_skills_check_crafting_prerequisites`
  - 描述：检查是否满足制作前置条件。
- `agentbox_skills_check_trigger_mint_prerequisites`
  - 描述：检查是否满足 mint 前置条件，包括 mint 间隔是否已到、`mintsCount` 是否仍小于 `maxMintCount`；地图上是否已有 `ground_tokens` 会作为策略层信息一并返回。

### 规划辅助

- `agentbox_skills_summarize_role_state`
  - 描述：汇总当前角色状态。
- `agentbox_skills_summarize_world_static_info`
  - 描述：汇总世界静态信息。
- `agentbox_skills_summarize_world_dynamic_info`
  - 描述：汇总世界动态信息。

### 链上动作

大多数链上动作共享以下通用条件：

- 必须存在本地 signer。
- 如果该角色已设置 `controller`，signer 必须是 `controller`；如果未设置 `controller`，signer 必须是 `owner`。

- `agentbox_skills_move_instant`
  - 描述：移动到目标坐标。
  - 使用条件：角色当前必须处于 `Idle`；目标坐标必须明确；目标坐标必须落在地图范围内；移动距离必须落在角色当前 `speed` 允许的范围内。
- `agentbox_skills_teleport_start`
  - 描述：发起传送。
  - 使用条件：角色当前必须处于 `Idle`；传送目标必须明确；目标坐标必须落在地图范围内；目标坐标不能与当前位置相同；已经处于 `Teleporting` 时不能重复发起；传送开始后通常需要等待并在之后 `finish`。
- `agentbox_skills_finish_current_action`
  - 描述：完成当前动作。
  - 使用条件：`finishable.canFinish` 必须为真；当前角色状态必须属于 skill 已映射的可完成状态：`Learning`、`Crafting`、`Gathering` 或 `Teleporting`；其中 `Learning` 的完成动作不走 owner/controller 权限校验，而是直接由链上 `finishLearning` 规则决定。
- `agentbox_skills_gather_start`
  - 描述：发起采集。
  - 使用条件：角色当前必须处于 `Idle`；角色必须已经站在当前资源地块上；当前地块必须是资源点且仍有 `stock`；地块的 `resourceType` 必须对应一个已学会的技能。
- `agentbox_skills_learn_npc_start`
  - 描述：从 NPC 发起学习。
  - 使用条件：角色当前必须处于 `Idle`；角色必须位于 NPC 的精确坐标；NPC 必须存在；NPC 当前不能处于教学中；NPC 提供的目标技能必须已配置学习时长；该技能当前还不能已学会。
- `agentbox_skills_learn_player_request`
  - 描述：向其他玩家发起学习请求。
  - 使用条件：角色当前必须处于 `Idle`；目标 teacher wallet 必须存在；teacher 与 student 必须位于同一坐标；teacher 必须已学会目标技能；student 当前不能已学会该技能；目标技能必须已配置学习时长。
- `agentbox_skills_learn_player_accept`
  - 描述：接受玩家间学习交互。
  - 使用条件：teacher 当前必须处于 `Idle`；student wallet 必须存在；student 当前必须处于 `Learning`；student.learning.teacherWallet 必须等于当前 teacher；student.learning.startBlock 必须为 `0`；teacher 与 student 必须位于同一坐标。
- `agentbox_skills_craft_start`
  - 描述：发起制作。
  - 使用条件：角色当前必须处于 `Idle`；recipe 必须存在；所需技能必须已学会；所需资源必须已经足量持有。
- `agentbox_skills_combat_attack`
  - 描述：发起攻击。
  - 使用条件：角色当前必须处于 `Idle`；目标 wallet 必须存在；目标当前 `hp` 必须大于 `0`；目标必须处于角色当前 `range` 的攻击距离内。
- `agentbox_skills_equip_put_on`
  - 描述：装备物品。
  - 使用条件：角色当前必须处于 `Idle`；目标装备必须存在、归角色所有，且可装备到对应槽位。
- `agentbox_skills_equip_take_off`
  - 描述：卸下装备。
  - 使用条件：角色当前必须处于 `Idle`；指定槽位当前必须已经有装备。
- `agentbox_skills_land_buy`
  - 描述：购买土地。
  - 使用条件：角色必须已经站在目标地块坐标上；目标地块不能是资源点；目标地块当前不能已被拥有；角色必须具有足够的 reliable balance 支付 `landPrice`。
- `agentbox_skills_land_set_contract`
  - 描述：设置土地 contract。
  - 使用条件：角色必须有权限管理该角色对应的钱包；目标地块必须归该 `roleWallet` 所有；`contractAddress` 必须是有效地址；该 `contractAddress` 当前不能已绑定到其他地块。
- `agentbox_skills_social_dm`
  - 描述：发送私信。
  - 使用条件：必须满足通用权限条件；合约本身不额外校验目标 wallet 是否存在或消息内容格式。
- `agentbox_skills_social_global`
  - 描述：发送全局消息。
  - 使用条件：必须满足通用权限条件；合约本身不额外校验消息内容格式。
- `agentbox_skills_cancel_current_action`
  - 描述：取消当前动作。
  - 使用条件：如果当前状态是 `Learning`，则必须是玩家间学习而不是 NPC 学习，且 `learning.startBlock` 必须为 `0`；如果当前状态是 `Teaching`，则当前角色必须确实处于教学中。
- `agentbox_skills_trigger_mint`
  - 描述：触发 mint。
  - 使用条件：必须存在本地 signer；`mintsCount` 必须小于 `maxMintCount`；`current_block` 与 `last_mint.block_number` 的差值必须至少达到 `mint_interval_blocks`。当前地图上是否仍有 `ground_tokens` 不是 `triggerMint` 合约本身的硬前置条件，但仍可作为策略层判断依据。
