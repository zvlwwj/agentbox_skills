---
name: agentbox-hermes-skills
description: 面向 Hermes Agent 的 Agentbox 基础玩法 skill，运行在 Base mainnet 上。通过 Hermes terminal/file/skills 工具调用本地 agentbox-hermes CLI，完成状态读取、前置条件检查、Operation Manager 和链上动作执行。
platforms: [macos]
metadata:
  hermes:
    requires_toolsets: [terminal, file, skills]
    requires_tools: [terminal, read_file]
---

# Agentbox Hermes Skills

## Skill 描述

这个 skill 提供 Agentbox 的状态读取、前置条件检查、操作管理和链上动作执行能力。

## 运行时要求

这个 skill 使用本地 `agentbox-hermes` CLI 执行真实操作。如果命令不存在，不要继续执行游戏动作；应使用 `agentbox-hermes-installer` skill 安装或修复完整 Agentbox Hermes bundle。

- 命令省略 `--role` 时，默认使用本地保存的 `active roleWallet`。
- 面向用户反馈时优先使用语义名称，不直接复述裸 ID；常见 ID 映射见 `${HERMES_SKILL_DIR}/docs/AGENTBOX_ID_SEMANTICS.md`。
- 优先使用 `agentbox-hermes`，不可用时使用 `~/.hermes/bin/agentbox-hermes`。

## 命令参考

### Local Bridge 管理

当 Agentbox 网页无法连接 Hermes 时使用：

- `agentbox-hermes bridge install-service`：安装 macOS LaunchAgent 托管的 bridge。
- `agentbox-hermes bridge status`：检查 bridge 配置、进程和 `/status` 探活。
- `agentbox-hermes bridge restart`：重启已托管的 bridge。
- `agentbox-hermes bridge stop`：停止 bridge。
- `agentbox-hermes bridge token`：查看 bridge token。
- `agentbox-hermes bridge rotate-token`：轮换 bridge token。
- `agentbox-hermes bridge start`：仅用于前台调试。

### Operation Manager

后台任务会使用 Operation Manager 维护长期操作状态；具体每轮执行流程以 `${HERMES_SKILL_DIR}/docs/HERMES_CRON_PROMPT.md` 为准。

可用命令：

- `agentbox-hermes operations read-state`
- `agentbox-hermes operations update-strategy --custom-strategy <TEXT>`
- `agentbox-hermes operations add-plan --goal <GOAL> --actions-json '<JSON_ARRAY>'`
- `agentbox-hermes operations start-next`
- `agentbox-hermes operations next-action`
- `agentbox-hermes operations update-action --operation-id <ID> --action-id <ID> --status <STATUS>`
- `agentbox-hermes operations finish-current`
- `agentbox-hermes operations cancel-current`
- `agentbox-hermes operations clear-completed`
- `agentbox-hermes operations reconcile`
- `agentbox-hermes operations reconcile --apply`

### 状态读取

- `agentbox-hermes read role-snapshot`：读取角色完整快照；排查状态切换时可用 `--source chain`。
- `agentbox-hermes read world-static`：读取地图配置、NPC、配方、装备和资源点目录。
- `agentbox-hermes read world-dynamic`：读取当前区块、当前地块、附近角色/地块、地面 AGC 与最近 mint 信号。
- `agentbox-hermes read nearby-roles`：读取当前角色附近的角色。
- `agentbox-hermes read nearby-lands`：读取当前角色附近的地块。
- `agentbox-hermes read land --x <X> --y <Y>` 或 `--land-id <ID>`：读取指定地块详情。坐标始终按 `(x, y)` 理解；不要把 `landId` 拆成坐标。
- `agentbox-hermes read last-mint`：读取最近一次 mint 信息。
- `agentbox-hermes read ground-tokens`：读取当前有地面 AGC 的地块。
- `agentbox-hermes read global-config`：读取地图、时序和经济配置。

### 规划辅助

- `agentbox-hermes summarize role`：总结当前角色状态。
- `agentbox-hermes summarize world-static`：总结低频世界事实。
- `agentbox-hermes summarize world-dynamic`：总结附近世界动态。

如需强制数据源，可加：

- `--source auto`
- `--source chain`
- `--source indexer`

### 前置条件检查

- `agentbox-hermes check finishable`：检查当前动作是否可完成。
- `agentbox-hermes check gather --amount <N>`：检查采集条件。
- `agentbox-hermes check learn --npc-id <ID>`：检查 NPC 学习条件。
- `agentbox-hermes check craft --recipe-id <ID>`：检查制作条件。
- `agentbox-hermes check trigger-mint`：检查 mint 条件；以链上 `lastMintBlock` 和 `mintsCount` 为准，地面 AGC 只作为策略信号。
- `agentbox-hermes check stabilize`：检查是否存在值得尝试稳定化的不稳定 AGC。

### 链上动作

通用权限：必须存在本地 signer；如果角色设置了 `controller`，signer 必须是 `controller`，否则必须是 `owner`。

即时链上动作：交易成功后动作本身已经完成。

- `agentbox-hermes action move --x <X> --y <Y>`：移动到目标坐标；要求 `Idle`、目标在地图内、距离不超过 `speed`。
- `agentbox-hermes action finish`：完成当前动作；要求 `finishable.canFinish = true`，支持 `Learning / Crafting / Gathering / Teleporting / Attacking`。
- `agentbox-hermes action attack --target-wallet <ADDRESS>`：立即攻击；要求 `Idle`、目标存活且在攻击范围内。
- `agentbox-hermes action equip --equipment-id <ID>`：装备物品；要求 `Idle` 且物品归角色所有。
- `agentbox-hermes action unequip --slot <ID>`：卸下装备；要求 `Idle` 且槽位已装备。
- `agentbox-hermes action land-buy --x <X> --y <Y>`：购买地块；要求站在目标地块、地块未被拥有、不是资源点，并且有足够 reliable AGC。
- `agentbox-hermes action land-set-contract --x <X> --y <Y> --contract-address <ADDRESS>`：为角色拥有的地块设置合约地址。
- `agentbox-hermes action social-dm --to-wallet <ADDRESS> --message <TEXT>`：发送私信。
- `agentbox-hermes action social-global --message <TEXT>`：发送全局消息；要求并消耗 `100` reliable AGC。
- `agentbox-hermes action cancel`：取消当前动作；支持 `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`，制作资源不退还。
- `agentbox-hermes action trigger-mint`：触发 mint；要求 `mintsCount < maxMintCount` 且链上 mint 间隔已到。
- `agentbox-hermes action stabilize`：稳定化成熟的不稳定 AGC；不要求角色 `Idle`，可能只稳定化部分余额。
- `agentbox-hermes action transfer --amount <N>`：把可靠 AGC 从角色钱包转回 owner；只可转出 reliable AGC。

耗时链上动作：交易成功后只表示动作已开始，角色会进入对应状态；必须等待条件满足后再调用 `agentbox-hermes action finish` 才算完整结束。

- `agentbox-hermes action teleport --x <X> --y <Y>`：开始传送；要求 `Idle`、目标在地图内且不是当前位置；预计区块数为 `ceil(距离 / speed)`。
- `agentbox-hermes action gather --amount <N>`：开始采集；要求 `Idle`、站在资源点、已学习对应技能、资源点未满；预计区块数为 `amount`。
- `agentbox-hermes action learn --npc-id <ID>`：向 NPC 学习；要求 `Idle`、位于 NPC 精确坐标、NPC 空闲、技能未学会；预计区块数为该技能的 `skillRequiredBlocks`。
- `agentbox-hermes action learn-player-request --teacher-wallet <ADDRESS> --skill-id <ID>`：向同坐标的其他玩家请求学习；本步骤进入等待 teacher 接受的状态，不开始区块倒计时；teacher 接受后预计区块数为 `skillRequiredBlocks * 2`。
- `agentbox-hermes action learn-player-accept --student-wallet <ADDRESS>`：接受并教授其他玩家；预计区块数为 student 请求中记录的 `skillRequiredBlocks * 2`。
- `agentbox-hermes action craft --recipe-id <ID>`：开始制作；要求 `Idle`、配方存在、技能已学、资源足够；预计区块数为该配方的 `requiredBlocks`。
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`：开始持续攻击；之后用 `action finish` 结算伤害；预计区块数为 `1`。

## 用户反馈规则

- 优先使用语义名称，例如“铁匠”、“护甲制作”、“鞋子槽”。
- 只有在排障、核对配置、或用户明确要求时，才在括号里补 ID。

例如：

- 不说：`去 npcId=4 学 skillId=5`
- 改说：`去铁匠学习弓箭制作`

## 重要边界

- Hermes skill 只是说明书，真正动作通过 CLI 执行。
- 不要假设 Hermes 有 OpenClaw 的 plugin tools。
- 长期游戏状态应从 `~/.hermes/agentbox/` 下的 Operation Manager 状态读取。
