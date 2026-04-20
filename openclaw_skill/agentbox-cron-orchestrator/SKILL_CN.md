---

## name: agentbox-cron-orchestrator

description: 用于在 OpenClaw 中为 Agentbox 创建、更新和维护稳定后台 cron job 的专用 skill。适合用户要求“让 agent 自己创建一个长期后台运行任务”时使用。

# Agentbox Cron Orchestrator

## Skill描述

这个 skill 不直接提供新的链上游戏工具，而是指导 OpenClaw agent：

- 为 Agentbox 创建一个长期后台运行的 cron job
- 更新已有 cron job，而不是重复创建多个相似任务
- 使用固定周期调度 + prompt 内部 `next_cron_job_time` 跳过机制，实现稳定后台运行
- 为 Agentbox 创建或更新“游戏日报” cron job，用于定期向用户输出日报

它适合以下场景：

- 用户要求“在后台运行游戏”
- 用户要求“帮我创建一个稳定运行的 Agentbox cron job”
- 用户要求“帮我更新已有 cron job 的 prompt / session / 调度参数”

## 重要约定

- 当用户要求“后台运行游戏”时，默认应同时创建或更新两个任务：
  - `agentbox-background-runner`：负责持续推进游戏
  - `agentbox-daily-report`：负责每天生成游戏日报

## cron job delivery

对后台 Agentbox cron job，推荐：

- `delivery.mode = "none"`

原因：

- 避免因 `channel` 不存在导致 run 被误标成 error
- 后台代理通常不需要主动公告到聊天渠道

对“游戏日报”任务，不建议默认静默。

如果用户没有明确要求“不发送”，应先自动检查当前是否存在可用投递渠道。检查顺序应固定为：

- 先看 `openclaw channels status`
- 再看 `openclaw channels list`
- 如果仍不确定，再检查本地配置中是否存在已启用的 channel 配置

如果存在可用投递渠道，必须同时显式写入：

- `delivery.mode = "announce"`
- `delivery.channel = "<verified_channel>"`
- 对日报任务，默认同时开启 `delivery.bestEffort = true`，避免仅因外部渠道投递失败而把整次日报任务标记为失败

如果该渠道还要求显式目标地址、会话地址或接收对象，agent 应继续自动发现并显式写入对应的投递目标，例如：

- `delivery.to = "<resolved_target>"`

投递目标的发现原则应固定为：

- 优先使用 OpenClaw 当前已经验证过、最近成功使用过、或可直接从本地状态推断出的投递链路
- 优先读取本地 channel / pairing / 日志 / 配置中的现成信息，而不是要求用户重复提供
- 如果当前渠道缺少必要目标且本地无法自动解析，应继续尝试寻找另一个可投递且已知目标的渠道
- 只有在所有候选渠道都缺少必要目标时，才回退为 `delivery.mode = "none"`

不要只因为某个 channel 已启用，就省略对应的目标地址；对需要目标地址的渠道来说，没有目标时，cron 主动投递仍会失败。

如果没有可用渠道，自动回退为：

- `delivery.mode = "none"`
- 继续生成到专用 session / 记录文件中

## 游戏运行 cron job 的默认策略

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
- 还应同时创建或更新日报任务

### 游戏日报 cron job 的默认策略

- 调度类型：`every`
- 推荐间隔：`86400000ms`（每 24 小时一次）
- `enabled: true`
- `deleteAfterRun: false`
- 推荐 `sessionTarget`：
  - 可以继续使用命名 session，例如 `session:agentbox-daily-report`
  - 但如果要主动投递，必须同时显式写入：
    - `delivery.mode = "announce"`
    - `delivery.channel = "<verified_channel>"`
    - `delivery.bestEffort = true`
    - 如果该渠道要求显式目标，还要补齐对应的 `delivery.to` 或等价目标字段
- `payload.kind: "agentTurn"`
- `lightContext: true`

说明：

- 日报任务和后台运行任务需要分开
- 日报任务主要负责汇总最近 24 小时的进展、产出和异常，而不是推进新的链上动作
- 如果用户没有明确要求“不发送”，日报任务应先按固定顺序检查是否有可用 channel；有则显式写入 `delivery.mode = "announce"`、`delivery.channel` 与 `delivery.bestEffort = true`，并自动补齐该渠道所需的目标地址；如果当前渠道缺少目标且无法自动解析，应尝试另一个可投递渠道；只有都不可用时才自动切到 `delivery.mode = "none"`

## Prompt来源

选择 prompt 模板前，需要先判断用户语言：

- 如果用户当前主要使用中文交流，则使用中文模板
- 否则默认使用英文模板

创建 Agentbox 后台 cron job 时，应优先使用以下 prompt 模板：

- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT.md`
- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT_CN.md`

创建 Agentbox 游戏日报 cron job 时，应优先使用以下 prompt 模板：

- `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT.md`
- `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT_CN.md`

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
- `summery`

如果是日报任务，默认不要改坏以下输出结构：

- `日报时间范围`
- `角色概览`
- `关键进展`
- `资源与 AGC 变化`
- `风险 / 异常`
- `下一步建议`

## 创建或更新时的优先级

### 1. 先查是否已有同用途 job

如果已经存在明显用于 Agentbox 后台运行的 job：

- 优先更新已有 job
- 不要无故创建重复 job

如果用户要求“后台运行”，需要分别检查：

- 是否已存在后台运行 job
- 是否已存在日报 job

默认应保证两者都存在；缺哪个就补哪个。

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

### 4. 如果用户要求新增日报任务

优先判断现有 job 是否已经承担“日报汇总”功能：

- 若已有单独日报 job，优先更新它
- 若只有后台运行 job，不要默认把日报逻辑直接混进去
- 更推荐单独新建一个日报 job，职责更清晰

## 推荐 job 约定

默认推荐如下命名：

- job 名称：`agentbox-background-runner`
- session target：`session:agentbox-background-runner`

日报任务默认推荐如下命名：

- job 名称：`agentbox-daily-report`
- session target：`session:agentbox-daily-report`

这样 job 名和 session 名保持一致，便于排查。

## agent 执行这个 skill 时应遵守的规则

- 面向用户解释时，优先说语义，不要堆 OpenClaw 内部字段名
- 除非用户要求，不要创建多个重复后台任务
- 后台游戏任务默认静默；日报任务默认应投递给用户，除非用户明确要求不投递
- 如果用户只说“后台稳定运行”，默认采用固定 10 分钟 `every` 调度
- 如果用户只说“后台稳定运行”，默认同时创建后台运行任务和日报任务
- 如果用户要求更高频或更低频，再显式调整 `everyMs`
- 如果用户要求“每天生成日报”，默认采用固定 24 小时 `every` 调度
- 如果日报没有明确要求“不发送”，先按固定顺序检查是否存在可用 channel；有则显式写入 `delivery.mode = "announce"` 和 `delivery.channel`，没有则自动改为 `delivery.mode = "none"`

## 成功完成后的反馈方式

完成 cron job 创建或更新后，应向用户清楚反馈：

- 是新建还是更新
- job 名称
- 调度类型与间隔
- session 名称
- 是否静默运行
- prompt 使用的是哪份模板

日报任务反馈示例：

> 已创建游戏日报 cron job `agentbox-daily-report`，采用每 24 小时一次的固定调度，绑定 `session:agentbox-daily-report`，并使用 `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT_CN.md` 作为日报模板。后续该任务会按固定周期汇总最近一天的游戏进展。

用户要求“后台长期运行”时的推荐反馈示例：

> 已创建两项后台任务：`agentbox-background-runner` 负责每 10 分钟一次的固定调度，用于持续推进游戏；`agentbox-daily-report` 负责每 24 小时一次的固定调度，用于汇总最近一天的游戏日报。两个任务会分别运行，避免把游戏推进和日报生成耦合在同一个 cron job 中。
