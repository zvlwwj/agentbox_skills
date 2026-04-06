---
name: agentbox-skills
description: 面向 OpenClaw agent 编排的 Agentbox 基础玩法工具集，运行在 Base Sepolia 上。用户通过与 OpenClaw 对话表达目标，OpenClaw agent 再调用这些工具读取状态、生成下一步操作并执行。
---

# Agentbox Skills

## 游戏简介

Agentbox 是一个运行在链上的状态驱动游戏。角色可以在地图上拾取AGC代币、移动、传送、学习、采集、制作、战斗，并与 NPC、其他玩家和地块交互。

合约源码：
- https://github.com/zvlwwj/agentbox_solidity/tree/master/src

## Skill描述

将这个 skill 用作 OpenClaw agent 的基础能力面，而不是给用户手工逐个调用原子操作。

这个 skill 为 OpenClaw agent 提供：

- 角色与世界状态读取
- signer 与注册辅助能力
- 直接链上动作
- 前置条件检查
- 用于规划的轻量摘要

## 推荐使用方式

推荐的使用方式是由 OpenClaw agent 在对话循环中编排这些工具：

1. 读取当前角色或世界状态
2. 检查目标动作的前置条件
3. 提交一个直接写链动作
4. 再次读取状态

用户层面的交互应该是：

1. 用户通过自然语言表达目标
2. OpenClaw agent 根据上下文生成阶段目标与下一步操作
3. OpenClaw agent 调用这些工具执行原子动作
4. 后续可在此基础上接入后台自动执行

## 主要工具说明

### Signer与注册辅助

- `agentbox.signer.prepare`
  - 描述：创建并激活本地单个 gameplay 私钥。
- `agentbox.signer.import`
  - 描述：导入并激活本地单个 gameplay 私钥。
- `agentbox.signer.export`
  - 描述：导出当前本地 gameplay 私钥。
- `agentbox.signer.activate`
  - 描述：重新激活当前本地 gameplay 私钥。
- `agentbox.signer.read`
  - 描述：读取当前本地 signer 状态。
- `agentbox.registration.prepare`
  - 描述：使用当前 active signer 准备直接注册。
- `agentbox.registration.confirm`
  - 描述：确认 active signer 资金并继续注册。

### 状态读取

- `agentbox.skills.read_role_snapshot`
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
- `agentbox.skills.read_world_static_info`
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
- `agentbox.skills.read_world_dynamic_info`
  - 描述：读取世界中的动态信息。
  - 返回的主要信息：
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `nearby_lands`
    - `lands_with_ground_tokens`
    - `last_mint`
- `agentbox.skills.read_nearby_roles`
  - 描述：读取附近角色信息。
  - 返回的主要信息：
    - `roleId`
    - `roleWallet`
    - `ownerAddress`
    - `controllerAddress`
    - `x`
    - `y`
    - `state`
- `agentbox.skills.read_nearby_lands`
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
- `agentbox.skills.read_land`
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
- `agentbox.skills.read_last_mint`
  - 描述：读取最近一次 mint 信息。
  - 返回的主要信息：
    - `event_name`
    - `block_number`
    - `block_timestamp`
    - `tx_hash`
    - `decoded_args`
- `agentbox.skills.read_lands_with_ground_tokens`
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
- `agentbox.skills.read_global_config`
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

- `agentbox.skills.check_finishable`
  - 描述：检查当前动作是否可 `finish`。
- `agentbox.skills.check_gather_prerequisites`
  - 描述：检查是否满足采集前置条件。
- `agentbox.skills.check_learning_prerequisites`
  - 描述：检查是否满足学习前置条件。
- `agentbox.skills.check_crafting_prerequisites`
  - 描述：检查是否满足制作前置条件。
- `agentbox.skills.check_trigger_mint_prerequisites`
  - 描述：检查是否满足 mint 前置条件。

### 规划辅助

- `agentbox.skills.summarize_role_state`
  - 描述：汇总当前角色状态。
- `agentbox.skills.summarize_world_static_info`
  - 描述：汇总世界静态信息。
- `agentbox.skills.summarize_world_dynamic_info`
  - 描述：汇总世界动态信息。
- `agentbox.skills.list_available_actions`
  - 描述：列出当前可用动作。

### 链上动作

- `agentbox.skills.move.instant`
  - 描述：移动到目标坐标。
  - 使用条件：角色当前应允许移动；目标坐标应明确；如果当前已经在持续动作中，通常应先判断是否需要 `finish` 或 `cancel`。
- `agentbox.skills.teleport.start`
  - 描述：发起传送。
  - 使用条件：角色当前应允许开始传送；不应在已经 `Teleporting` 时重复发起；传送开始后通常需要等待并在之后 `finish`。
- `agentbox.skills.finish_current_action`
  - 描述：完成当前动作。
  - 使用条件：`finishable.canFinish` 应为真；适用于传送、学习、采集、制作等 `start -> finish` 动作。
- `agentbox.skills.gather.start`
  - 描述：发起采集。
  - 使用条件：角色应站在正确资源点上；该地块应可采集；角色状态应允许开始采集；相关采集前置条件应已满足。
- `agentbox.skills.learn.npc.start`
  - 描述：从 NPC 发起学习。
  - 使用条件：角色应位于正确 NPC 位置；NPC 应提供目标技能；角色状态应允许开始学习。
- `agentbox.skills.learn.player.request`
  - 描述：向其他玩家发起学习请求。
  - 使用条件：目标玩家应存在且可教学；双方位置与状态应满足玩家间学习要求。
- `agentbox.skills.learn.player.accept`
  - 描述：接受玩家间学习交互。
  - 使用条件：当前应存在可接受的玩家间学习请求；角色状态应允许接受。
- `agentbox.skills.craft.start`
  - 描述：发起制作。
  - 使用条件：应拥有所需 recipe、资源和技能前置；角色状态应允许开始制作。
- `agentbox.skills.combat.attack`
  - 描述：发起攻击。
  - 使用条件：目标角色应存在；距离、状态和战斗前置应满足；不应对无效或不可攻击目标发起攻击。
- `agentbox.skills.equip.put_on`
  - 描述：装备物品。
  - 使用条件：目标装备应存在且可穿戴；对应装备槽位应允许装备。
- `agentbox.skills.equip.take_off`
  - 描述：卸下装备。
  - 使用条件：目标装备当前应已处于装备状态。
- `agentbox.skills.land.buy`
  - 描述：购买土地。
  - 使用条件：目标地块应可购买；余额与购买前置应满足。
- `agentbox.skills.land.set_contract`
  - 描述：设置土地 contract。
  - 使用条件：角色应拥有该土地或具备相应权限；目标 contract 参数应有效。
- `agentbox.skills.social.dm`
  - 描述：发送私信。
  - 使用条件：目标应明确；消息内容应有效。
- `agentbox.skills.social.global`
  - 描述：发送全局消息。
  - 使用条件：消息内容应有效，并符合系统允许的发送条件。
- `agentbox.skills.cancel_current_action`
  - 描述：取消当前动作。
  - 使用条件：当前应存在可取消动作；当既不能 `finish`、继续等待也不合理时，可考虑使用。
- `agentbox.skills.trigger_mint`
  - 描述：触发 mint。
  - 使用条件：通常应先确认当前不存在更直接的 token 机会，且距离上次 mint 已达到最小区块间隔。

## 运行时配置

这个 skill 使用 `agentbox_core/agentbox_runtime/config.py` 中的内置运行时默认配置。

默认值包括：

- `RPC_URL = https://sepolia.base.org`
- `CHAIN_ID = 84532`
- `INDEXER_BASE_URL = http://127.0.0.1:8000`
- 本地 signer 存储路径
- 注册与自动执行相关余额阈值

## 交互模型

- 用户负责表达意图与约束，OpenClaw agent 负责将其转化为目标、操作与工具调用。
- 这个 skill 负责提供可靠的读取、校验和原子动作执行能力。
- 这个工程的目标方向是让 OpenClaw agent 能基于这些工具继续发展出目标生成、操作生成和后台自动执行能力。
- 在后台自动执行能力尚未接入前，这个 skill 仍然主要作为 agent 编排工具层使用。
- 本地 signer 采用单私钥模型，不支持多私钥管理。
