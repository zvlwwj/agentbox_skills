---
name: agentbox-hermes-cron-orchestrator
description: 用于在 Hermes 中创建、更新和维护 Agentbox 后台 cron job 的专用 skill。适合用户要求“让 Hermes 自己在后台稳定运行 Agentbox”时使用。
requires_toolsets: [terminal, file, skills, cronjob]
requires_tools: [terminal, read_file, cronjob]
---

# Agentbox Hermes Cron Orchestrator

## 目的

这个 skill 专门负责：

- 创建 Hermes 原生的 Agentbox 后台 cron job
- 更新已有后台 job，而不是重复创建多个
- 把后台状态写入 `~/.hermes/agentbox/background_runner_state.json`

## 核心原则

### 1. Hermes 自己全接管后台运行

不要依赖 OpenClaw 的 cron/session。

正确做法是：

- 使用 Hermes `cronjob(action="create" | "update" | "list")`
- job 附加以下 skill：
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`

### 2. 所有游戏动作都通过本地 CLI 执行

Cron prompt 中不要假设有 OpenClaw plugin tool。

真正的读写动作都通过：

- `agentbox-hermes ...`
- 或 `~/.hermes/bin/agentbox-hermes ...`

### 3. Fresh session 规则

Hermes cron 每次都是全新 session。

因此：

- 不要依赖历史对话记忆
- 每轮开始先读取 `~/.hermes/agentbox/background_runner_state.json`
- 每轮结束后写回新的执行结论和 `next_check_time`

## 默认后台 job 约定

推荐默认值：

- job 名称：`agentbox-background-runner`
- schedule：`every 10m`
- attached skills：
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt 模板：
  - `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

## 创建或更新时的优先级

### 1. 先列出已有 job

优先用：

- `cronjob(action="list")`

检查是否已存在明显用于 Agentbox 后台运行的 job。

### 2. 若已存在，优先更新

不要无故创建重复任务。

优先更新：

- `prompt`
- `skills`
- `schedule`
- `enabled/paused` 状态

### 3. 若不存在，再创建

创建时应明确：

- job 名称
- schedule
- attached skills
- prompt 内容

## Prompt 使用要求

创建 job 时应优先使用：

- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

不要直接把 OpenClaw 版 prompt 原样搬过来。

## 状态文件要求

后台 job 必须使用这些固定文件：

- `~/.hermes/agentbox/background_runner_state.json`
- 可选：`~/.hermes/agentbox/last_execution_summary.md`

默认结构里至少要有：

- `goal_id`
- `operation_goal`
- `stop_reason`
- `next_check_time`
- `active_role`

## 创建完成后的反馈

向用户反馈时应说明：

- 是新建还是更新
- job 名称
- 调度间隔
- 附加了哪些 skill
- 使用的是哪份 prompt 模板
- 状态文件写到哪里

推荐反馈示例：

> 已在 Hermes 中创建后台任务 `agentbox-background-runner`，采用每 10 分钟一次的固定调度，附加 `agentbox-hermes-skills` 与 `agentbox-hermes-cron-orchestrator` 两个 skill，并使用 Hermes 专用后台 prompt。运行状态会写入 `~/.hermes/agentbox/background_runner_state.json`。
