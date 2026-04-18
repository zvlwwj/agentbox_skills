---
name: agentbox-cron-orchestrator
description: 用于在 OpenClaw 中为 Agentbox 创建、更新和维护稳定后台 cron job 的专用 skill。适合用户要求“让 agent 自己创建一个长期后台运行任务”时使用。
---

# Agentbox Cron Orchestrator

## Skill描述

这个 skill 不直接提供新的链上游戏工具，而是指导 OpenClaw agent：

- 为 Agentbox 创建一个长期后台运行的 cron job
- 更新已有 cron job，而不是重复创建多个相似任务
- 使用固定周期调度 + prompt 内部 `next_cron_job_time` 跳过机制，实现稳定后台运行

它适合以下场景：

- 用户要求“在后台长期运行游戏”
- 用户要求“帮我创建一个稳定运行的 Agentbox cron job”
- 用户要求“帮我更新已有 cron job 的 prompt / session / 调度参数”

## 重要限制

### 1. 不要让 isolated cron job 自己修改自己的调度

OpenClaw 的 isolated cron agent 默认拿不到 owner-only 的 `cron.update` 权限。
因此：

- 不要依赖 cron job 自己修改下一次执行时间
- 不要把“动态改 cron 调度”写成这个后台任务的硬依赖

正确做法是：

- 创建固定周期的 `every` cron job
- 在 prompt 内通过上一轮的 `next_cron_job_time` 决定“本轮是否跳过”

### 2. 优先复用已有命名 session

推荐默认把后台运行任务绑定到命名 session，例如：

- `session:agentbox-background-runner`

这样便于：

- 保持连续上下文
- 查看 session 历史
- 排查最终展开的 prompt

### 3. delivery 默认应静默

对后台 Agentbox cron job，推荐：

- `delivery.mode = "none"`

原因：

- 避免因 `channel` 不存在导致 run 被误标成 error
- 后台代理通常不需要主动公告到聊天渠道

## 创建 cron job 的默认策略

当用户要求“创建一个后台 cron job”时，默认使用下面的策略：

- 调度类型：`every`
- 推荐间隔：`600000ms`（每 10 分钟一次）
- `enabled: true`
- `deleteAfterRun: false`
- `sessionTarget: "session:agentbox-background-runner"`
- `payload.kind: "agentTurn"`
- `delivery.mode: "none"`
- `lightContext: true`

说明：

- 固定每 10 分钟触发一次
- 是否真的执行链上动作，由 prompt 内的 `next_cron_job_time` 决定
- 如果当前时间未到 `next_cron_job_time`，本轮只读取并记录，不执行新的链上写操作

## Prompt来源

创建 Agentbox 后台 cron job 时，应优先使用这份 prompt 模板：

- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT_CN.md`

使用前需要替换其中的上下文变量，例如：

- 角色 `roleWallet`
- `owner`
- 当前时间占位

如果用户明确要求自定义策略，可以在此模板基础上做局部修改，但默认不要偏离原有结构：

- `操作说明`
- `执行结论`
- `goal_id`
- `planned_actions`
- `stop_reason`
- `next_cron_job_time`

## 创建或更新时的优先级

### 1. 先查是否已有同用途 job

如果已经存在明显用于 Agentbox 后台运行的 job：

- 优先更新已有 job
- 不要无故创建重复 job

### 2. 若不存在，再创建新 job

创建时应明确这些字段：

- job 名称
- session target
- 调度类型与周期
- payload message
- delivery 模式

### 3. 如果用户只是要修改 prompt

不要删除 job 重建，优先直接更新：

- `payload.message`
- 必要的调度参数

## 推荐 job 约定

默认推荐如下命名：

- job 名称：`agentbox-background-runner`
- session target：`session:agentbox-background-runner`

这样 job 名和 session 名保持一致，便于排查。

## agent 执行这个 skill 时应遵守的规则

- 面向用户解释时，优先说语义，不要堆 OpenClaw 内部字段名
- 除非用户要求，不要创建多个重复后台任务
- 除非用户要求，不要把调度类型建成单次 `at`
- 除非用户要求，不要启用公告式 delivery
- 如果用户只说“后台稳定运行”，默认采用固定 10 分钟 `every` 调度
- 如果用户要求更高频或更低频，再显式调整 `everyMs`

## 成功完成后的反馈方式

完成 cron job 创建或更新后，应向用户清楚反馈：

- 是新建还是更新
- job 名称
- 调度类型与间隔
- session 名称
- 是否静默运行
- prompt 使用的是哪份模板

推荐反馈示例：

> 已创建后台 cron job `agentbox-background-runner`，采用每 10 分钟一次的固定调度，绑定 `session:agentbox-background-runner`，静默运行。实际是否执行链上动作由 prompt 中的 `next_cron_job_time` 控制。
