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
如果工具参数里省略了 `role`，默认会使用当前本地保存的 `active roleWallet`；不再自动猜测 owner 的最后一个账号。
面向用户反馈时，优先使用语义名称，不直接复述 `skillId / recipeId / npcId / equipmentId / slot` 这类 ID；只有在排障、核对配置、或用户明确要求查看 ID 时，才以括号形式补充。

## 常用 ID 语义速查

读取 Agentbox 数据时，默认可以按下面这张表理解常见 ID。这些映射主要用于内部理解、调试和核对配置，不应直接原样对用户复述。

### 技能 ID

- `1`：Woodcutting，木材采集，对应 `resourceType = 1`
- `2`：Husbandry，羊毛采集，对应 `resourceType = 2`
- `3`：Mining，石头采集，对应 `resourceType = 3`
- `4`：弓箭制作
- `5`：护甲制作
- `6`：鞋子制作

### 资源 ID

- `1`：wood，木材
- `2`：wool，羊毛
- `3`：stone，石头

### 角色状态 ID

- `0`：`Idle`，没有进行中的计时动作
- `1`：`Learning`，正在向 NPC 或其他玩家学习
- `2`：`Teaching`，正在教授其他玩家
- `3`：`Crafting`，正在制作
- `4`：`Gathering`，正在采集
- `5`：`Teleporting`，已开始传送，等待完成
- `6`：`PendingSpawn`，等待 VRF 返回出生结果

### 装备槽位 ID

- `1`：Weapon，武器槽
- `2`：Armor，护甲槽
- `3`：Shoes，鞋子槽

### 装备 ID

- `1001`：弓箭，槽位 `1`
- `1002`：护甲，槽位 `2`
- `1003`：鞋子，槽位 `3`

### 配方 ID

- `1`：弓箭制作配方，需要 `skillId = 4`，产出 `equipmentId = 1001`
- `2`：护甲制作配方，需要 `skillId = 5`，产出 `equipmentId = 1002`
- `3`：鞋子制作配方，需要 `skillId = 6`，产出 `equipmentId = 1003`

### NPC ID

- `1`：伐木工，教授 `skillId = 1`
- `2`：牧民，教授 `skillId = 2`
- `3`：矿工，教授 `skillId = 3`
- `4`：弓箭制作导师，教授 `skillId = 4`
- `5`：护甲制作导师，教授 `skillId = 5`
- `6`：鞋子制作导师，教授 `skillId = 6`

## 主要工具说明

### Signer与注册辅助

- `agentbox_signer_prepare`
  - 描述：创建本地单个 gameplay 私钥。默认不会覆盖已经存在的本地 signer；只有在明确要切换 owner 时，才应显式传入 `force=true`。
  - 安全要求：如果当前本地已经存在 signer，在任何会替换它的操作之前，agent 必须先提醒玩家导出并备份私钥，并明确征得玩家确认。未完成这两步时，不应尝试覆盖 signer。
- `agentbox_signer_import`
  - 描述：导入本地单个 gameplay 私钥。默认不会覆盖已经存在的本地 signer；只有在明确要切换 owner 时，才应显式传入 `force=true`。
  - 安全要求：如果当前本地已经存在 signer，在任何会替换它的操作之前，agent 必须先提醒玩家导出并备份私钥，并明确征得玩家确认。未完成这两步时，不应尝试覆盖 signer。
- `agentbox_signer_export`
  - 描述：导出当前本地 gameplay 私钥。
- `agentbox_signer_read`
  - 描述：读取当前本地 signer 信息、当前 owner 拥有的账号数量，以及当前 active role。
- `agentbox_registration_confirm`
  - 描述：使用当前本地 signer 检查注册状态；如果当前 active role 仍处于 `PendingSpawn`，则恢复该注册流程；否则在条件满足时允许继续注册新号。新号创建成功后会自动成为当前 active role。
- `agentbox_roles_list_owned`
  - 描述：列出当前 active signer 对应 owner 持有的全部游戏账号。
- `agentbox_roles_read_active`
  - 描述：读取当前 active role 状态，并检查它是否仍归当前 active signer 所有。
- `agentbox_roles_select_active`
  - 描述：按 `roleWallet` 或 `roleId` 选择当前 active role。之后如果省略 `role` 参数，默认就操作这个账号。
- `agentbox_roles_clear_active`
  - 描述：清除当前 active role。清除后，再调用省略 `role` 的 gameplay 工具会直接报错，直到重新选择 active role。

### 多账号 Owner 使用流程

- 准备或导入本地 signer。
- 调用 `agentbox_roles_list_owned` 查看当前 owner 的全部账号。
- 调用 `agentbox_roles_select_active` 选中本轮默认操作的 `roleWallet`。
- 后续 gameplay 工具如果省略 `role`，都会默认作用在这个 active role 上。
- 如果要切到另一个账号，重新调用 `agentbox_roles_select_active` 即可。
- 如果同一 owner 再注册新号，`agentbox_registration_confirm` 成功后会自动把新号设为 active role。
- 当用户要求“创建新账号”时，如果本地已经存在 signer，默认应复用这个 signer 并直接调用 `agentbox_registration_confirm`；不要重新创建或导入新的 signer，除非用户明确要求切换 owner。
- 当用户要求删除、替换、重置本地 signer 时，必须先提醒玩家备份当前私钥，再取得明确确认，之后才允许执行会覆盖 signer 的操作。

### 状态读取

- `agentbox_skills_read_role_snapshot`
  - 描述：读取角色当前完整快照。
  - 可选参数：`source`
    - `auto`：默认，优先使用 indexer，可回退到 chain。
    - `chain`：强制使用纯链上角色数据；适合排查状态是否真的已经切换。
    - `indexer`：强制使用 indexer 数据。
  - 核心返回结构：
    - `staticInfo`
    - `dynamicInfo`
  - 执行时重点关注：
    - `dynamicInfo.role.state`
    - `dynamicInfo.role.x`
    - `dynamicInfo.role.y`
    - `dynamicInfo.action`
    - `dynamicInfo.finishable.canFinish`
- `agentbox_skills_read_world_static_info`
  - 描述：读取世界中的相对静态信息。
  - 可选参数：`source`
    - `auto`：默认。
    - `chain`：尽量只返回链上可直接拿到的字段；仅能由 indexer 提供的字段会留空。
    - `indexer`：优先返回 indexer 丰富信息。
  - 核心返回结构：
    - 世界坐标约定与基础配置
    - NPC、配方、装备与资源点目录
    - 当前装备及其可制作关系
- `agentbox_skills_read_world_dynamic_info`
  - 描述：读取世界中的动态信息。
  - 可选参数：`source`
    - `auto`：默认。
    - `chain`：尽量只返回链上可直接拿到的字段；例如 `current_block`、`current_land` 可用，但 `nearby_roles`、`nearby_lands`、`lands_with_ground_tokens`、`last_mint` 这类 indexer 字段可能为空。
    - `indexer`：优先返回 indexer 丰富信息。
  - 核心返回结构：
    - 当前区块与当前地块
    - 附近角色与附近地块
    - 地面 AGC 与最近一次 mint 信号
  - 执行时重点关注：
    - `current_block`
    - `current_land`
    - `nearby_roles`
    - `lands_with_ground_tokens`
- `agentbox_skills_read_nearby_roles`
  - 描述：读取附近角色信息。
  - 可选参数：`source`
    - `auto`：默认。
    - `chain`：当前没有纯链上枚举附近角色的实现，因此通常返回空列表。
    - `indexer`：返回 indexer 的附近角色列表。
  - 核心返回结构：
    - 附近角色身份
    - 坐标
    - 当前状态
- `agentbox_skills_read_nearby_lands`
  - 描述：读取附近地块信息。
  - 可选参数：`source`
    - `auto`：默认。
    - `chain`：当前没有纯链上枚举附近地块的实现，因此通常返回空列表。
    - `indexer`：返回 indexer 的附近地块列表。
  - 核心返回结构：
    - 坐标信息
    - 所有权与地块配置
    - 资源点与地面 AGC 信息
- `agentbox_skills_read_land`
  - 描述：读取指定地块的详细信息。
  - 核心返回结构：
    - 坐标信息
    - 所有权与地块配置
    - 资源点与地面 AGC 信息
- `agentbox_skills_read_last_mint`
  - 描述：读取最近一次 mint 信息。
  - 核心返回结构：
    - 事件元数据
    - 解码后的 mint 参数
    - 反解后的 mint 坐标
- `agentbox_skills_read_lands_with_ground_tokens`
  - 描述：读取带有 `ground_tokens` 的土地列表。
  - 核心返回结构：
    - 坐标信息
    - 所有权与地块配置
    - 地面 AGC 信息
  - 坐标说明：
    - 坐标顺序始终是 `(x, y)`。
    - `landId` 的计算方式是 `landId = y * mapWidth + x`。
    - 不要把 `landId` 的前半段和后半段直接当作 `x / y`。
- `agentbox_skills_read_global_config`
  - 描述：读取全局配置。
  - 核心返回结构：
    - 地图尺寸
    - mint、稳定化、制作等时序配置
    - 土地价格等经济配置

### 前置条件检查

- `agentbox_skills_check_finishable`
  - 描述：检查当前动作是否可 `finish`。
- `agentbox_skills_check_gather_prerequisites`
  - 描述：检查是否满足采集前置条件，包括角色是否处于 `Idle`、当前地块是否为资源点、对应技能是否已学会，以及请求采集数量是否为正数。
- `agentbox_skills_check_learning_prerequisites`
  - 描述：检查是否满足学习前置条件，包括角色是否处于 `Idle`、是否位于 NPC 精确坐标、NPC 是否空闲，以及目标技能是否已配置学习时长且尚未学会。
- `agentbox_skills_check_crafting_prerequisites`
  - 描述：检查是否满足制作前置条件。
- `agentbox_skills_check_trigger_mint_prerequisites`
  - 描述：检查是否满足 mint 前置条件，包括基于链上 `lastMintBlock` 判断 mint 间隔是否已到、`mintsCount` 是否仍小于 `maxMintCount`；地图上是否已有 `ground_tokens` 会作为策略层信息一并返回，但不会阻止 mint。
- `agentbox_skills_check_stabilize_prerequisites`
  - 描述：检查当前角色是否存在值得尝试稳定化的不稳定 AGC 余额。
  - 核心返回结构：
    - 是否可执行
    - 当前余额分层
    - 稳定化时序信息
    - 失败原因
  - 说明：
    - 当前经济合约只直接暴露聚合后的 `unreliableBalance`，不暴露每一笔不稳定余额各自的成熟区块。
    - 因此这个检查回答的是“当前是否有不稳定余额，值得尝试调用稳定化”，而不是“本块精确有多少余额已经成熟”。

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
  - 使用条件：角色当前必须处于 `Idle`；角色必须已经站在当前资源地块上；当前地块必须是资源点；地块的 `resourceType` 必须对应一个已学会的技能。
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
  - 使用条件：必须存在本地 signer；`mintsCount` 必须小于 `maxMintCount`；`current_block` 与链上 `lastMintBlock` 的差值必须至少达到 `mint_interval_blocks`。即使 indexer 中还没有历史 mint 事件，只要链上 `lastMintBlock` 已满足间隔，也应允许判断为可 mint。当前地图上是否仍有 `ground_tokens` 不是 `triggerMint` 合约本身的硬前置条件，但仍可作为策略层判断依据。
- `agentbox_skills_stabilize_balance`
  - 描述：尝试把角色钱包中已经成熟的不稳定 AGC 稳定化。
  - 使用条件：必须存在本地 signer；如果该角色已设置 `controller`，signer 必须是 `controller`；如果未设置 `controller`，signer 必须是 `owner`；角色当前至少应存在 `unreliableBalance > 0`，否则不建议调用。
  - 说明：
    - `stabilizeBalance(roleWallet)` 是经济合约上的独立动作，不要求角色必须处于 `Idle`。
    - 由于链上不直接暴露每笔不稳定余额的成熟时间，这个动作即使成功发送，也可能只稳定化其中一部分，或在当前区块没有可成熟余额时不产生实际变化。
- `agentbox_skills_transfer_agc_to_owner`
  - 描述：将角色钱包中已经稳定化、可转出的 AGC 转回当前 owner 地址。
  - 使用条件：必须存在本地 signer；如果该角色已设置 `controller`，signer 必须是 `controller`；如果未设置 `controller`，signer 必须是 `owner`；`amount` 必须大于 `0`；角色钱包当前必须具有足够的 `reliableBalance`。
  - 说明：
    - 该动作会通过 `AgentboxRoleWallet.execute(...)` 让角色钱包调用经济合约的 ERC20 `transfer(owner, amount)`。
    - 只能转出已经稳定化、可用的 reliable AGC；尚未稳定化的不稳定 AGC 不能直接转出。
