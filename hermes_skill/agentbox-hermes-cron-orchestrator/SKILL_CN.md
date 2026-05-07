---
name: agentbox-hermes-cron-orchestrator
description: 用于在 Hermes 中创建、更新和维护 Agentbox 后台 cron job 的专用 skill。适合长期后台运行、更新已有后台任务，以及更改当前游戏目标等场景。
requires_toolsets: [terminal, file, skills, cronjob]
requires_tools: [terminal, read_file, cronjob]
---

# Agentbox Hermes Cron Orchestrator

## 目的

这个 skill 专门负责：

- 创建 Hermes 原生的 Agentbox 后台 cron job
- 更新已有后台 job，而不是重复创建多个
- 把后台状态写入 `~/.hermes/agentbox/background_runner_state.json`
- 在用户要求更改游戏目标时，更新现有后台 job 的目标与状态继承逻辑

## cron job delivery

对后台 Agentbox 运行任务，推荐：

- `deliver = "local"`

原因：

- 后台推进任务通常不需要主动发到外部聊天渠道
- 这样可以避免把高频巡航信息变成噪音

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

## 默认后台运行 job 约定

推荐默认值：

- job 名称：`agentbox-background-runner`
- schedule：`every 30m`
- deliver：`local`
- attached skills：
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt 模板：
  - `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

说明：

- 固定每 30 分钟触发一次
- 是否真的执行链上动作，由 prompt 内的 `next_check_time` 决定
- 如果当前时间未到 `next_check_time`，本轮只读取并记录，不执行新的链上写操作

## 创建或更新时的优先级

### 1. 先列出已有 job

优先用：

- `cronjob(action="list")`

如果用户要求“后台运行”，需要分别检查：

- 是否已存在后台运行 job

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
- deliver
- attached skills
- prompt 内容

### 4. 如果用户只是修改 prompt

不要删除 job 重建，优先直接更新：

- `prompt`
- 必要的调度参数

如果用户要求更改当前游戏目标，也应优先走这一类更新路径，而不是新建重复任务。

此时应至少检查并按需更新：

- 后台运行 job 的 `prompt`
- `~/.hermes/agentbox/background_runner_state.json` 中与目标相关的字段，例如 `goal_id`、`operation_goal`、`stop_reason`、`next_check_time`

## Prompt 使用要求

选择 prompt 模板前，需要先判断用户语言：

- 如果用户当前主要使用中文交流，则使用中文模板
- 否则默认使用英文模板

创建 Hermes 后台运行 job 时，应优先使用：

- `agentbox_skills/docs/HERMES_CRON_PROMPT.md`
- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

不要直接把 OpenClaw 版 prompt 原样搬过来。

## 状态文件要求

后台运行 job 必须使用这些固定文件：

- `~/.hermes/agentbox/background_runner_state.json`
- 可选：`~/.hermes/agentbox/last_execution_summary.md`

默认结构里至少要有：

- `goal_id`
- `operation_goal`
- `stop_reason`
- `next_check_time`
- `active_role`

## agent 执行这个 skill 时应遵守的规则

- 面向用户解释时，优先说语义，不要堆内部字段名
- 除非用户要求，不要创建多个重复后台任务
- 如果用户只说“后台稳定运行”，默认采用 `every 30m`
- 如果用户要求“更改游戏目标”，也需要参考这个 skill，优先更新现有后台 job 的 prompt 与状态文件，而不是只在当前对话里临时说明
- 后台运行任务默认 `deliver = local`

## 创建完成后的反馈

向用户反馈时应说明：

- 是新建还是更新
- job 名称
- 调度间隔
- deliver 策略
- 附加了哪些 skill
- 使用的是哪份 prompt 模板
- 状态文件写到哪里
