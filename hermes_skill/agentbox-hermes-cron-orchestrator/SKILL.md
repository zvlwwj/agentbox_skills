---
name: agentbox-hermes-cron-orchestrator
description: Dedicated skill for creating, updating, and maintaining Agentbox background cron jobs in Hermes. Use it when the user wants Hermes itself to keep Agentbox running in the background.
requires_toolsets: [terminal, file, skills, cronjob]
requires_tools: [terminal, read_file, cronjob]
---

# Agentbox Hermes Cron Orchestrator

## Purpose

This skill is responsible for:

- creating Hermes-native Agentbox background cron jobs
- updating existing background jobs instead of creating duplicates
- creating or updating a dedicated daily report cron job for Agentbox
- persisting runtime state in `~/.hermes/agentbox/background_runner_state.json`

## Important Conventions

- When the user asks to "run the game in the background", the default behavior should be to create or update two jobs together:
  - `agentbox-background-runner`: continuously advances gameplay
  - `agentbox-daily-report`: generates a daily game report

## cron job delivery

For background Agentbox runner jobs, the recommended default is:

- `deliver = "local"`

Reason:

- background gameplay loops usually should not proactively post high-frequency progress to external chat channels
- this keeps routine execution quiet and avoids turning the runner into notification spam

For daily report jobs, silent mode should not be the default.

If the user does not explicitly say "do not send", the agent should first check whether a usable delivery route exists. The priority order should be:

- first use the job's `origin` if it is already a valid deliverable source
- if no usable `origin` exists, prefer a Hermes-configured home channel / home target
- if the home target is unavailable, try another route that Hermes can already verify, has recently delivered through, or can infer directly from local state

If a usable route exists, explicitly set:

- `deliver = "<resolved_route>"`

Where `<resolved_route>` may be:

- `origin`
- `telegram`
- `discord`
- `slack`
- or any other Hermes-supported delivery platform

If the selected route still requires extra target information, channel naming, or a concrete recipient, the agent should continue resolving that Hermes-side target automatically instead of asking the user to restate it.

If the current route is missing a required target and local state cannot resolve it, try the next usable route.

Only fall back to:

- `deliver = "local"`

after all candidate delivery routes fail to produce a valid deliverable path.


## Core Principles

### 1. Hermes fully owns background execution

Do not depend on OpenClaw cron/session behavior.

The correct flow is:

- use Hermes `cronjob(action="create" | "update" | "list")`
- attach these skills to the job:
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`

### 2. All gameplay actions go through the local CLI

Do not assume OpenClaw plugin tools exist in Hermes cron runs.

All real reads and writes should be done through:

- `agentbox-hermes ...`
- or `~/.hermes/bin/agentbox-hermes ...`

### 3. Fresh session rule

Hermes cron jobs run in a fresh session every time.

Therefore:

- do not depend on chat history
- read `~/.hermes/agentbox/background_runner_state.json` at the start of each run
- write the new execution conclusion and `next_check_time` back at the end

## Default Gameplay Runner Job Conventions

Recommended defaults:

- job name: `agentbox-background-runner`
- schedule: `every 10m`
- deliver: `local`
- attached skills:
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt template:
  - `agentbox_skills/docs/HERMES_CRON_PROMPT.md`

Notes:

- it wakes up on a fixed 10-minute interval
- whether it should actually perform on-chain actions is decided by `next_check_time` inside the prompt
- if the current time has not yet reached `next_check_time`, the run should only read and record state, and should not perform any new on-chain write
- the agent should also create or update the daily report job together with it

## Default Daily Report Job Conventions

Recommended defaults:

- job name: `agentbox-daily-report`
- schedule: `every 24h`
- deliver:
  - if a usable delivery route exists, explicitly set the corresponding Hermes route
  - otherwise fall back to `local`
- attached skills:
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt template:
  - `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT.md`

Notes:

- the daily report job should stay separate from the gameplay runner
- the daily report job is mainly responsible for summarizing the last 24 hours of progress, outputs, and exceptions, rather than driving new on-chain actions
- Hermes tracks `last_delivery_error` separately, so the daily report job should prioritize successful report generation first, then best-effort external delivery through Hermes' native delivery model

## Create/Update Priority

### 1. List existing jobs first

Use:

- `cronjob(action="list")`

If the user asks for background operation, check separately:

- whether a gameplay runner job already exists
- whether a daily report job already exists

By default, both should exist. Create whichever one is missing.

### 2. Update first if one already exists

Do not create duplicates without a clear reason.

Prefer updating:

- `prompt`
- `skills`
- `schedule`
- paused/enabled state

### 3. Only create when no suitable job exists

When creating, explicitly define:

- job name
- schedule
- deliver
- attached skills
- prompt body

### 4. If the user only wants to modify the prompt

Do not delete and recreate the job. Prefer updating:

- `prompt`
- any schedule fields that actually need to change

### 5. If the user asks to add a daily report job

First determine whether a dedicated daily report job already exists:

- if a dedicated daily report job already exists, update it first
- if only a gameplay runner exists, do not automatically mix reporting logic into it
- it is better to create a separate daily report job with a clearer responsibility boundary

## Prompt Requirements

Detect the user's language before selecting a prompt template:

- if the user is communicating in Chinese, use the Chinese template
- otherwise, default to the English template

When creating a Hermes gameplay runner job, prefer:

- `agentbox_skills/docs/HERMES_CRON_PROMPT.md`
- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

When creating a Hermes daily report job, prefer:

- `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT.md`
- `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT_CN.md`

Do not copy the OpenClaw prompts unchanged.

## State File Requirements

Background jobs must use these fixed files:

- `~/.hermes/agentbox/background_runner_state.json`
- optional: `~/.hermes/agentbox/last_execution_summary.md`

The stored state should at least include:

- `goal_id`
- `operation_goal`
- `stop_reason`
- `next_check_time`
- `active_role`

## Rules While Using This Skill

- explain outcomes to the user in semantic, plain language
- unless the user explicitly asks for it, do not create multiple duplicate background jobs
- if the user simply wants stable background operation, create both the gameplay runner job and the daily report job by default
- if the user simply wants stable background operation, default to `every 10m`
- if the user asks for "generate a daily report every day", default to `every 24h`
- background runner jobs should default to `deliver = local`
- if the user does not explicitly say "do not send", daily report jobs should prefer finding a usable delivery route and explicitly setting `deliver`
- if no delivery route can be resolved, daily report jobs should fall back to `local` instead of leaving delivery ambiguous

## Success Feedback

When the cron job is created or updated, tell the user:

- whether it was created or updated
- the job name
- the schedule interval
- the delivery strategy
- which skills were attached
- which prompt template was used
- where the runtime state is persisted

Example feedback for the daily report job:

> Created Hermes daily report job `agentbox-daily-report` with a fixed `every 24h` schedule, attached `agentbox-hermes-skills` and `agentbox-hermes-cron-orchestrator`, and configured `agentbox_skills/docs/HERMES_DAILY_REPORT_PROMPT.md` as the report template.

Recommended feedback example when the user asks for long-running background gameplay:

> Created two Hermes background jobs: `agentbox-background-runner` runs on a fixed `every 10m` schedule to keep gameplay progressing, and `agentbox-daily-report` runs on a fixed `every 24h` schedule to summarize the last day's gameplay report. They are kept separate so gameplay progression and report generation are not coupled into the same cron job.
