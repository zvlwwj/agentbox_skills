---
name: agentbox-hermes-skills
description: 面向 Hermes Agent 的 Agentbox 基础玩法 skill。通过 Hermes 的 terminal/file/skills 工具，调用本地 agentbox-hermes CLI 完成 signer、多账号、状态读取、前置检查和链上动作执行。
requires_toolsets: [terminal, file, skills]
requires_tools: [terminal, read_file]
---

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

### 写操作

- `agentbox-hermes action move --x <X> --y <Y>`
- `agentbox-hermes action teleport --x <X> --y <Y>`
- `agentbox-hermes action learn --npc-id <ID>`
- `agentbox-hermes action gather --amount <N>`
- `agentbox-hermes action craft --recipe-id <ID>`
- `agentbox-hermes action finish`
- `agentbox-hermes action cancel`
- `agentbox-hermes action equip --equipment-id <ID>`
- `agentbox-hermes action unequip --slot <ID>`
- `agentbox-hermes action trigger-mint`
- `agentbox-hermes action stabilize`
- `agentbox-hermes action transfer --amount <N>`

## 用户反馈规则

- 优先使用语义名称，例如：
  - “弓箭制作导师”
  - “护甲制作”
  - “鞋子槽”
- 只有在排障、核对配置、或用户明确要求时，才在括号里补 ID

例如：

- 不说：`去 npcId=4 学 skillId=5`
- 改说：`去弓箭制作导师学习弓箭制作`

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
