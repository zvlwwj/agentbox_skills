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
- 为 Agentbox 创建或更新“游戏日报” cron job
- 把后台状态写入 `~/.hermes/agentbox/background_runner_state.json`

## 重要约定

- 当用户要求“后台运行游戏”时，默认应同时创建或更新两个任务：
  - `agentbox-background-runner`：负责持续推进游戏
  - `agentbox-daily-report`：负责每天生成游戏日报

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
- schedule：`every 10m`
- attached skills：
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt 模板：
  - `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

说明：

- 固定每 10 分钟触发一次
- 是否真的执行链上动作，由 prompt 内的 `next_check_time` 决定
- 如果当前时间未到 `next_check_time`，本轮只读取并记录，不执行新的链上写操作
- 还应同时创建或更新日报任务

## 默认游戏日报 job 约定

推荐默认值：

- job 名称：`agentbox-daily-report`
- schedule：`every 24h`
- attached skills：
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt 模板：
  - `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT_CN.md`

说明：

- 日报任务和后台运行任务需要分开
- 日报任务主要负责汇总最近 24 小时的进展、产出和异常，而不是推进新的链上动作

## 创建或更新时的优先级

### 1. 先列出已有 job

优先用：

- `cronjob(action="list")`

如果用户要求“后台运行”，需要分别检查：

- 是否已存在后台运行 job
- 是否已存在日报 job

默认应保证两者都存在；缺哪个就补哪个。

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

### 4. 如果用户只是修改 prompt

不要删除 job 重建，优先直接更新：

- `prompt`
- 必要的调度参数

### 5. 如果用户要求新增日报任务

优先判断是否已存在单独的日报 job：

- 若已有单独日报 job，优先更新它
- 若只有后台运行 job，不要默认把日报逻辑直接混进去
- 更推荐单独新建一个日报 job，职责更清晰

## Prompt 使用要求

创建 Hermes 后台运行 job 时，应优先使用：

- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

创建 Hermes 游戏日报 job 时，应优先使用：

- `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT_CN.md`

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
- 如果用户只说“后台稳定运行”，默认同时创建后台运行任务和日报任务
- 如果用户只说“后台稳定运行”，默认采用 `every 10m`
- 如果用户要求“每天生成日报”，默认采用 `every 24h`

## 创建完成后的反馈

向用户反馈时应说明：

- 是新建还是更新
- job 名称
- 调度间隔
- 附加了哪些 skill
- 使用的是哪份 prompt 模板
- 状态文件写到哪里

日报任务反馈示例：

> 已在 Hermes 中创建日报任务 `agentbox-daily-report`，采用每 24 小时一次的固定调度，附加 `agentbox-hermes-skills` 与 `agentbox-hermes-cron-orchestrator` 两个 skill，并使用 `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT_CN.md` 作为日报模板。

用户要求“后台长期运行”时的推荐反馈示例：

> 已在 Hermes 中创建两项后台任务：`agentbox-background-runner` 负责每 10 分钟一次的固定调度，用于持续推进游戏；`agentbox-daily-report` 负责每 24 小时一次的固定调度，用于汇总最近一天的游戏日报。两者会分别运行，避免把游戏推进和日报生成耦合在同一个 cron job 中。
