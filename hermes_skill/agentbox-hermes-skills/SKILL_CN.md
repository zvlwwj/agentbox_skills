---

## name: agentbox-hermes-skills
description: 面向 Hermes Agent 的 Agentbox 基础玩法 skill。通过 Hermes 的 terminal/file/skills 工具，调用本地 agentbox-hermes CLI 完成 signer、多账号、状态读取、前置检查和链上动作执行。
requires_toolsets: [terminal, file, skills]
requires_tools: [terminal, read_file]

# Agentbox Hermes Skills

## 目的

这个 skill 让 Hermes Agent 在 **不依赖 OpenClaw plugin/runtime** 的前提下，直接管理 Agentbox 游戏账号并执行链上动作。

真正的执行入口是本地 CLI：

- 首选：`agentbox-hermes`
- 如果命令不在 PATH 中：`~/.hermes/bin/agentbox-hermes`

所有命令默认返回 JSON。对用户解释时，优先使用语义名称，不直接复述裸 ID。

## 本地状态位置

Hermes 版 Agentbox 状态固定保存在：

- `~/.hermes/agentbox/active_signer.json`
- `~/.hermes/agentbox/active_role.json`
- `~/.hermes/agentbox/background_runner_state.json`

规则：

- 默认账号解析只使用 `active_role.json`
- 没有 active role 时，不要自动猜最后一个账号，必须显式报错并先选择账号

## 基础命令

### Signer

- `agentbox-hermes signer prepare`
- `agentbox-hermes signer import --private-key <KEY>`
- `agentbox-hermes signer export`
- `agentbox-hermes signer read`
- `agentbox-hermes registration confirm --profile-mode auto_generate`

规则：

- 如果本地已经存在 signer，默认不要重新创建或导入新的 signer
- 当用户要求“创建新账号”时，如果已有 signer，默认复用这个 signer
- 只有用户明确要求切换 owner 时，才允许替换 signer
- 替换 signer 前，必须先提醒用户备份，并确认替换

### 多账号

- `agentbox-hermes roles list-owned`
- `agentbox-hermes roles read-active`
- `agentbox-hermes roles select-active --role-wallet <ROLE_WALLET>`
- `agentbox-hermes roles clear-active`

推荐流程：

1. 先 `signer read`
2. 再 `roles list-owned`
3. 需要默认操作某个账号时，执行 `roles select-active`
4. 之后省略 `--role` 的命令就会默认作用到 active role

### 操作管理

Operation Manager 按当前 `active roleWallet` 维护本地结构化操作文件，记录：

- 已完成操作，以及每个 action 的执行时间、交易哈希和结果
- 当前正在执行的操作，以及其中已完成和未完成的 action
- 未来计划操作，以及每个操作需要的 action list

命令：

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

后台长期运行时，优先使用 Operation Manager，而不是在 prompt 或聊天历史中手工维护完整 action 记录：

1. 先执行 `operations read-state`
2. 如果没有当前操作但存在计划操作，执行 `operations start-next`
3. 执行 `operations next-action` 获取下一步建议 action
4. 调用对应的 `agentbox-hermes action ...` 写操作
5. 写操作会由 runtime 自动记录为完成或失败
6. 如果本地 operation state 与链上状态冲突，以链上状态为准，并执行 `operations reconcile`

### 读取

- `agentbox-hermes read role-snapshot`
- `agentbox-hermes read world-static`
- `agentbox-hermes read world-dynamic`
- `agentbox-hermes read land --x <X> --y <Y>`
- `agentbox-hermes read last-mint`
- `agentbox-hermes read global-config`

如需强制数据源，可加：

- `--source auto`
- `--source chain`
- `--source indexer`

### 前置检查

- `agentbox-hermes check gather --amount <N>`
- `agentbox-hermes check learn --npc-id <ID>`
- `agentbox-hermes check craft --recipe-id <ID>`
- `agentbox-hermes check finishable`
- `agentbox-hermes check trigger-mint`
- `agentbox-hermes check stabilize`

采集补充规则：链上每个资源点最多允许 `10` 个角色同时采集。`check gather` 会返回该限制说明；如果当前占用人数无法直接读取，`action gather` 仍可能因为资源点已满而回退。

### 写操作

- `agentbox-hermes action move --x <X> --y <Y>`
- `agentbox-hermes action teleport --x <X> --y <Y>`
- `agentbox-hermes action learn --npc-id <ID>`
- `agentbox-hermes action gather --amount <N>`
- `agentbox-hermes action craft --recipe-id <ID>`
- `agentbox-hermes action attack --target-wallet <ADDRESS>`
- `agentbox-hermes action start-attack --target-wallet <ADDRESS>`
- `agentbox-hermes action finish`
- `agentbox-hermes action cancel`
- `agentbox-hermes action equip --equipment-id <ID>`
- `agentbox-hermes action unequip --slot <ID>`
- `agentbox-hermes action trigger-mint`
- `agentbox-hermes action stabilize`
- `agentbox-hermes action transfer --amount <N>`

## 用户反馈规则

- 优先使用语义名称，例如：
  - “铁匠”
  - “护甲制作”
  - “鞋子槽”
- 只有在排障、核对配置、或用户明确要求时，才在括号里补 ID

例如：

- 不说：`去 npcId=4 学 skillId=5`
- 改说：`去铁匠学习弓箭制作`

## 常用工作流

### 1. 首次准备

1. `agentbox-hermes signer prepare`
2. `agentbox-hermes signer read`
3. `agentbox-hermes roles list-owned`

### 2. 切换默认账号

1. `agentbox-hermes roles list-owned`
2. `agentbox-hermes roles select-active --role-wallet <ROLE_WALLET>`
3. `agentbox-hermes roles read-active`

### 3. 创建新账号

1. 先检查是否已有 signer：`agentbox-hermes signer read`
2. 如果已有 signer，默认复用，不要重新 prepare/import
3. 使用：
  - `agentbox-hermes registration confirm --profile-mode auto_generate`
  - 注册费用必须以链上当前 `getRegistrationFee()` 为准；当前阶梯为 `0.01/0.02/0.03/0.04/0.05 ETH`，第 `4000` 个角色后固定 `0.05 ETH`。
4. 注册成功后，重新读取：
  - `agentbox-hermes roles list-owned`
  - `agentbox-hermes roles read-active`

### 4. 安全写操作

1. 先读状态
2. 再做前置检查
3. 最后执行写操作
4. 写完后重新读取关键状态

## 重要边界

- Hermes skill 只是说明书，真正动作通过 CLI 执行
- 不要假设 Hermes 有 OpenClaw 的 plugin tools
- 不要依赖历史对话保存运行状态，长期任务状态应写进 `~/.hermes/agentbox/`
