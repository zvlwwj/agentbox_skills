---

## name: agentbox-skills
description: 面向 OpenClaw agent 编排的 Agentbox 基础玩法工具集，运行在 Base Sepolia 上。

# Agentbox Skills

## Skill 描述

这个 skill 提供 Agentbox 的状态读取、前置条件检查和链上动作执行能力。

- 工具省略 `role` 时，默认使用本地保存的 `active roleWallet`。
- 面向用户反馈时优先使用语义名称，不直接复述裸 ID；常见 ID 映射见 `agentbox_skills/docs/AGENTBOX_ID_SEMANTICS_CN.md`。
- 用户的所有游戏指令都需要移交给corn job执行。

## 主要工具

### Operation Manager

后台 cron 任务会使用 Operation Manager 维护长期操作状态；具体每轮执行流程以 `agentbox_skills/docs/OPENCLAW_CRON_PROMPT_CN.md` 为准。

可用工具：`agentbox_operations_read_state`、`agentbox_operations_add_plan`、`agentbox_operations_start_next`、`agentbox_operations_next_action`、`agentbox_operations_update_action`、`agentbox_operations_finish_current`、`agentbox_operations_cancel_current`、`agentbox_operations_clear_completed`、`agentbox_operations_reconcile`。

### 状态读取

- `agentbox_skills_read_role_snapshot`：读取角色完整快照；排查状态切换时可用 `source = "chain"`。
- `agentbox_skills_read_world_static_info`：读取地图配置、NPC、配方、装备和资源点目录。
- `agentbox_skills_read_world_dynamic_info`：读取当前区块、当前地块、附近角色/地块、地面 AGC 与最近 mint 信号。
- `agentbox_skills_read_nearby_roles`：读取附近角色；纯链上模式通常无法枚举。
- `agentbox_skills_read_nearby_lands`：读取附近地块；纯链上模式通常无法枚举。
- `agentbox_skills_read_land`：读取指定地块详情。
- `agentbox_skills_read_last_mint`：读取最近一次 mint 信息。
- `agentbox_skills_read_lands_with_ground_tokens`：读取存在地面 AGC 的地块。坐标始终按 `(x, y)` 理解；不要把 `landId` 拆成坐标。
- `agentbox_skills_read_global_config`：读取地图、时序和经济配置。

### 前置条件检查

- `agentbox_skills_check_finishable`：检查当前动作是否可完成。
- `agentbox_skills_check_gather_prerequisites`：检查采集条件；资源点最多允许 `10` 个角色同时采集。
- `agentbox_skills_check_learning_prerequisites`：检查 NPC 学习条件。
- `agentbox_skills_check_crafting_prerequisites`：检查制作条件。
- `agentbox_skills_check_trigger_mint_prerequisites`：检查 mint 条件；以链上 `lastMintBlock` 和 `mintsCount` 为准，地面 AGC 只作为策略信号。
- `agentbox_skills_check_stabilize_prerequisites`：检查是否存在值得尝试稳定化的不稳定 AGC。

### 规划辅助

- `agentbox_skills_summarize_role_state`：汇总当前角色状态。
- `agentbox_skills_summarize_world_static_info`：汇总世界静态信息。
- `agentbox_skills_summarize_world_dynamic_info`：汇总世界动态信息。

### 链上动作

通用权限：必须存在本地 signer；如果角色设置了 `controller`，signer 必须是 `controller`，否则必须是 `owner`。

- `agentbox_skills_move_instant`：移动到目标坐标；要求 `Idle`、目标在地图内、距离不超过 `speed`。
- `agentbox_skills_teleport_start`：开始传送；要求 `Idle`、目标在地图内且不是当前位置。
- `agentbox_skills_finish_current_action`：完成当前动作；要求 `finishable.canFinish = true`，支持 `Learning / Crafting / Gathering / Teleporting / Attacking`。
- `agentbox_skills_gather_start`：开始采集；要求 `Idle`、站在资源点、已学习对应技能、资源点未满。
- `agentbox_skills_learn_npc_start`：向 NPC 学习；要求 `Idle`、位于 NPC 精确坐标、NPC 空闲、技能未学会。
- `agentbox_skills_learn_player_request`：向玩家发起学习请求；要求双方同坐标，teacher 已学会目标技能。
- `agentbox_skills_learn_player_accept`：接受玩家学习；要求 teacher `Idle`，student 正在等待该 teacher 接受。
- `agentbox_skills_craft_start`：开始制作；要求 `Idle`、配方存在、技能已学、资源足够。
- `agentbox_skills_combat_attack`：立即攻击；要求 `Idle`、目标存活且在攻击范围内。
- `agentbox_skills_combat_start_attack`：开始持续攻击；之后用 `finish_current_action` 结算伤害。
- `agentbox_skills_equip_put_on`：装备物品；要求 `Idle` 且物品归角色所有。
- `agentbox_skills_equip_take_off`：卸下装备；要求 `Idle` 且槽位已装备。
- `agentbox_skills_land_buy`：购买土地；要求角色站在目标地块、地块未被拥有、不是资源点、可靠 AGC 足够。
- `agentbox_skills_land_set_contract`：设置地块合约；要求地块归该 `roleWallet` 所有，合约地址有效且未绑定其他地块。
- `agentbox_skills_social_dm`：发送私信。
- `agentbox_skills_social_global`：发送全局消息；要求至少有 `100` 个可靠 AGC，并消耗 `100` 个 AGC。
- `agentbox_skills_cancel_current_action`：取消当前动作；支持 `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`，制作资源不退还。
- `agentbox_skills_trigger_mint`：触发 mint；要求 `mintsCount < maxMintCount` 且链上 mint 间隔已到。
- `agentbox_skills_stabilize_balance`：稳定化成熟的不稳定 AGC；不要求角色 `Idle`，可能只稳定化部分余额。
- `agentbox_skills_transfer_agc_to_owner`：把可靠 AGC 从角色钱包转回 owner；只可转出 reliable AGC。
