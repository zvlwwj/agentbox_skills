---
name: agentbox-hermes-skills
description: 面向 Hermes Agent 的 Agentbox 基础玩法 skill，运行在 Base mainnet 上。通过 Hermes terminal/file/skills 工具调用本地 agentbox-hermes CLI，完成状态读取、前置条件检查、Operation Manager 和链上动作执行。
requires_toolsets: [terminal, file, skills]
requires_tools: [terminal, read_file]
---

# Agentbox Hermes Skills

## Skill 描述

这个 skill 提供 Agentbox 的状态读取、前置条件检查、操作管理和链上动作执行能力。

真正的执行入口是本地 CLI：

- 首选：`agentbox-hermes`
- 兜底：`~/.hermes/bin/agentbox-hermes`

所有命令默认返回 JSON。

- 命令省略 `--role` 时，默认使用本地保存的 `active roleWallet`。
- 面向用户反馈时优先使用语义名称，不直接复述裸 ID；常见 ID 映射见 `agentbox_skills/docs/AGENTBOX_ID_SEMANTICS_CN.md`。

## 命令参考

### Local Bridge 管理

当用户要求“连接 Agentbox 网页”、“启动 local bridge”、“Hermes bridge 没启动”、“网页连接 Hermes 失败”或类似诉求时，应优先帮助用户启动或修复 Hermes local bridge。

推荐长期运行方式：

- `agentbox-hermes bridge install-service`
- `agentbox-hermes bridge status`

如果 `agentbox-hermes` 不在 PATH 中，使用：

- `~/.hermes/bin/agentbox-hermes bridge install-service`
- `~/.hermes/bin/agentbox-hermes bridge status`

常用维护命令：

- `agentbox-hermes bridge status`：检查 bridge 配置、pid、LaunchAgent 与 `/status` 探活。
- `agentbox-hermes bridge restart`：重启已托管的 bridge。
- `agentbox-hermes bridge stop`：停止 bridge。
- `agentbox-hermes bridge token`：查看网页连接需要的 bridge token。
- `agentbox-hermes bridge rotate-token`：轮换 bridge token。
- `agentbox-hermes bridge start`：仅用于前台调试，不作为普通用户长期运行方式。

规则：

- 普通用户场景优先使用 `install-service`，因为它会通过 macOS LaunchAgent 托管 bridge。
- 启动后必须再运行 `status` 确认 bridge 真的可用。
- 如果用户只是想让网页连接 Hermes，不要让用户手动运行长期前台进程；应安装托管服务。

### Operation Manager

后台任务会使用 Operation Manager 维护长期操作状态；具体每轮执行流程以 `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md` 为准。

可用命令：

- `agentbox-hermes operations read-state`
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
- `agentbox-hermes read land --x <X> --y <Y>` 或 `--land-id <ID>`：读取指定地块详情。坐标始终按 `(x, y)` 理解；不要把 `landId` 拆成坐标。
- `agentbox-hermes read last-mint`：读取最近一次 mint 信息。
- `agentbox-hermes read global-config`：读取地图、时序和经济配置。

如需强制数据源，可加：

- `--source auto`
- `--source chain`
- `--source indexer`

### 前置条件检查

- `agentbox-hermes check finishable`：检查当前动作是否可完成。
- `agentbox-hermes check gather --amount <N>`：检查采集条件；资源点最多允许 `10` 个角色同时采集。
- `agentbox-hermes check learn --npc-id <ID>`：检查 NPC 学习条件。
- `agentbox-hermes check craft --recipe-id <ID>`：检查制作条件。
- `agentbox-hermes check trigger-mint`：检查 mint 条件；以链上 `lastMintBlock` 和 `mintsCount` 为准，地面 AGC 只作为策略信号。
- `agentbox-hermes check stabilize`：检查是否存在值得尝试稳定化的不稳定 AGC。

### 链上动作

通用权限：必须存在本地 signer；如果角色设置了 `controller`，signer 必须是 `controller`，否则必须是 `owner`。

- `agentbox-hermes action move --x <X> --y <Y>`：移动到目标坐标；要求 `Idle`、目标在地图内、距离不超过 `speed`。
- `agentbox-hermes action teleport --x <X> --y <Y>`：开始传送；要求 `Idle`、目标在地图内且不是当前位置。
- `agentbox-hermes action finish`：完成当前动作；要求 `finishable.canFinish = true`，支持 `Learning / Crafting / Gathering / Teleporting / Attacking`。
- `agentbox-hermes action gather --amount <N>`：开始采集；要求 `Idle`、站在资源点、已学习对应技能、资源点未满。
- `agentbox-hermes action learn --npc-id <ID>`：向 NPC 学习；要求 `Idle`、位于 NPC 精确坐标、NPC 空闲、技能未学会。
- `agentbox-hermes action craft --recipe-id <ID>`：开始制作；要求 `Idle`、配方存在、技能已学、资源足够。
- `agentbox-hermes action attack --target-wallet <ADDRESS>`：立即攻击；要求 `Idle`、目标存活且在攻击范围内。
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`：开始持续攻击；之后用 `action finish` 结算伤害。
- `agentbox-hermes action equip --equipment-id <ID>`：装备物品；要求 `Idle` 且物品归角色所有。
- `agentbox-hermes action unequip --slot <ID>`：卸下装备；要求 `Idle` 且槽位已装备。
- `agentbox-hermes action cancel`：取消当前动作；支持 `Learning / Teaching / Crafting / Gathering / Teleporting / Attacking`，制作资源不退还。
- `agentbox-hermes action trigger-mint`：触发 mint；要求 `mintsCount < maxMintCount` 且链上 mint 间隔已到。
- `agentbox-hermes action stabilize`：稳定化成熟的不稳定 AGC；不要求角色 `Idle`，可能只稳定化部分余额。
- `agentbox-hermes action transfer --amount <N>`：把可靠 AGC 从角色钱包转回 owner；只可转出 reliable AGC。

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
