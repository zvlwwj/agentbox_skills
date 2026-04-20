---

## name: agentbox-cron-orchestrator
description: A dedicated skill for creating, updating, and maintaining stable background cron jobs for Agentbox in OpenClaw. Use it when the user wants the agent to create a long-running background task by itself.

# Agentbox Cron Orchestrator

## Skill Description

This skill does not directly provide new onchain gameplay tools. Instead, it guides the OpenClaw agent to:

- create a long-running background cron job for Agentbox
- update an existing cron job instead of creating multiple similar jobs
- use fixed-interval scheduling plus a prompt-level `next_cron_job_time` skip mechanism to keep background execution stable
- create or update a dedicated "daily game report" cron job for Agentbox, so the user can receive regular reports

It is suitable for scenarios such as:

- the user asks to "run the game in the background"
- the user asks to "create a stable Agentbox cron job"
- the user asks to "update the prompt / session / scheduling parameters of an existing cron job"

## Important Conventions

- When the user asks to "run the game in the background", the default behavior should be to create or update two jobs together:
  - `agentbox-background-runner`: responsible for continuously advancing gameplay
  - `agentbox-daily-report`: responsible for generating a daily game report

## cron job delivery

For background Agentbox gameplay cron jobs, the recommended setting is:

- `delivery.mode = "none"`

Reason:

- it avoids runs being incorrectly marked as errors when no `channel` is available
- background agents usually do not need to proactively announce themselves to a chat channel

For "daily report" jobs, silent mode should not be the default.

If the user does not explicitly say "do not send", the agent should choose an available delivery target by default, in this order:

- the user's currently visible main session
- a session explicitly specified by the user
- a delivery channel explicitly requested by the user

Only when the user explicitly says "do not deliver" or "generate only without sending" may the report fall back to:

- generating into a session / record file
- and clearly telling the user that the daily report is not being proactively delivered

## Default Strategy For Gameplay Cron Jobs

- schedule type: `every`
- recommended interval: `600000ms` (every 10 minutes)
- `enabled: true`
- `deleteAfterRun: false`
- `sessionTarget: "session:agentbox-background-runner"`
- `payload.kind: "agentTurn"`
- `delivery.mode: "none"`
- `lightContext: true`

Notes:

- it wakes up on a fixed 10-minute interval
- whether it should actually perform onchain actions is decided by `next_cron_job_time` inside the prompt
- if the current time has not yet reached `next_cron_job_time`, the run should only read and record state, and should not perform any new onchain write
- the agent should also create or update the daily report job together with it

### Default Strategy For Daily Report Cron Jobs

- schedule type: `every`
- recommended interval: `86400000ms` (every 24 hours)
- `enabled: true`
- `deleteAfterRun: false`
- recommended `sessionTarget`:
  - if the user does not explicitly request "do not send", bind it to the user's current main session or a session explicitly specified by the user
  - only if the user explicitly wants "generate only without sending", bind it to a named session such as `session:agentbox-daily-report`
- `payload.kind: "agentTurn"`
- `lightContext: true`

Notes:

- the daily report job should stay separate from the gameplay runner
- the daily report job is mainly responsible for summarizing the last 24 hours of progress, outputs, and exceptions, rather than driving new onchain actions
- if the user does not explicitly request "do not send", the daily report job should default to a delivery target visible to the user

## Prompt Sources

Detect the user's language before selecting a prompt template:

- if the user is communicating in Chinese, use the Chinese template
- otherwise, default to the English template

When creating an Agentbox background gameplay cron job, the preferred prompt templates are:

- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT.md`
- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT_CN.md`

When creating an Agentbox daily report cron job, the preferred prompt templates are:

- `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT.md`
- `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT_CN.md`

Before use, replace the relevant runtime context variables such as:

- role `roleWallet`
- `owner`
- current time placeholders

If the user explicitly wants a custom strategy, you may make local edits on top of the template, but by default do not drift away from the original structure:

- `Operation Plan`
- `Execution Conclusion`
- `goal_id`
- `planned_actions`
- `stop_reason`
- `next_cron_job_time`
- `summery`

For daily report jobs, do not break the following output structure by default:

- `Report Time Range`
- `Role Overview`
- `Key Progress`
- `Resources and AGC Changes`
- `Risks / Exceptions`
- `Next-Step Suggestions`

## Priority When Creating Or Updating

### 1. Check whether a job with the same purpose already exists

If there is already a job clearly meant for Agentbox background execution:

- update the existing job first
- do not create duplicate jobs without a reason

If the user asks for "background operation", check separately:

- whether a gameplay runner job already exists
- whether a daily report job already exists

By default, both should exist. If either one is missing, create the missing one.

### 2. Create a new job only when necessary

When creating a new job, explicitly define:

- job name
- session target
- schedule type and interval
- payload message
- delivery mode

### 3. If the user only wants to modify the prompt

Do not delete and recreate the job. Prefer updating:

- `payload.message`
- any schedule fields that actually need to change

### 4. If the user asks to add a daily report job

First determine whether an existing job already serves the "daily summary" purpose:

- if a dedicated daily report job already exists, update it first
- if only a gameplay runner exists, do not automatically mix the reporting logic directly into it
- it is better to create a separate daily report job with a clear responsibility boundary

## Recommended Job Conventions

The default recommended naming is:

- job name: `agentbox-background-runner`
- session target: `session:agentbox-background-runner`

For the daily report job, the default recommended naming is:

- job name: `agentbox-daily-report`
- session target: `session:agentbox-daily-report`

This keeps job names and session names aligned, which makes debugging easier.

## Rules The Agent Should Follow When Using This Skill

- when explaining things to the user, prefer semantic descriptions instead of dumping OpenClaw internal field names
- unless the user explicitly asks for it, do not create multiple duplicate background jobs
- gameplay background jobs should be silent by default; daily report jobs should be delivered to the user by default, unless the user explicitly asks not to deliver them
- if the user only says "run it stably in the background", use a fixed 10-minute `every` schedule by default
- if the user only says "run it stably in the background", also create both the gameplay runner job and the daily report job by default
- if the user asks for a higher or lower frequency, explicitly adjust `everyMs`
- if the user asks for "generate a daily report every day", use a fixed 24-hour `every` schedule by default
- if the daily report does not explicitly say "do not send", prefer delivering it to a user-visible session or another available channel

## How To Report Success Back To The User

After creating or updating cron jobs, clearly tell the user:

- whether it was created or updated
- the job name
- the schedule type and interval
- the session name
- whether it runs silently
- which prompt template it uses

Example feedback for the daily report job:

> Created the daily game report cron job `agentbox-daily-report`. It uses a fixed schedule of once every 24 hours, is bound to `session:agentbox-daily-report`, and uses `agentbox_skills/docs/OPENCLAW_DAILY_REPORT_PROMPT.md` as the report template. From now on it will summarize the last day's gameplay progress on that schedule.

Recommended feedback example when the user asks for "long-running background gameplay":

> Created two background jobs: `agentbox-background-runner` uses a fixed schedule of once every 10 minutes to keep the game progressing continuously, and `agentbox-daily-report` uses a fixed schedule of once every 24 hours to summarize the last day's gameplay report. They run separately so gameplay progression and report generation are not coupled into the same cron job.
