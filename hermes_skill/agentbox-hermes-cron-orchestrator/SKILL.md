---
name: agentbox-hermes-cron-orchestrator
description: Dedicated skill for creating, updating, and maintaining Agentbox background cron jobs in Hermes. It is suitable for long-running background operation, updating existing background tasks, and changing the current gameplay goal.
requires_toolsets: [terminal, file, skills, cronjob]
requires_tools: [terminal, read_file, cronjob]
---

# Agentbox Hermes Cron Orchestrator

## Purpose

This skill is responsible for:

- creating Hermes-native Agentbox background cron jobs
- updating existing background jobs instead of creating duplicates
- persisting runtime state in `~/.hermes/agentbox/background_runner_state.json`
- updating the goal and state-inheritance flow of existing background jobs when the user changes the gameplay goal

## cron job delivery

For background Agentbox runner jobs, the recommended default is:

- `deliver = "local"`

Reason:

- background gameplay loops usually should not proactively post high-frequency progress to external chat channels
- this keeps routine execution quiet and avoids turning the runner into notification spam


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
- schedule: `every 30m`
- deliver: `local`
- attached skills:
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt template:
  - `agentbox_skills/docs/HERMES_CRON_PROMPT.md`

Notes:

- it wakes up on a fixed 30-minute interval
- whether it should actually perform on-chain actions is decided by `next_check_time` inside the prompt
- if the current time has not yet reached `next_check_time`, the run should only read and record state, and should not perform any new on-chain write

## Create/Update Priority

### 1. List existing jobs first

Use:

- `cronjob(action="list")`

If the user asks for background operation, check separately:

- whether a gameplay runner job already exists

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

If the user wants to change the current gameplay goal, this should also go through this update path instead of creating a duplicate job.

At minimum, check and update these parts as needed:

- the gameplay runner job's `prompt`
- goal-related fields in `~/.hermes/agentbox/background_runner_state.json`, such as `goal_id`, `operation_goal`, `stop_reason`, and `next_check_time`

## Prompt Requirements

Detect the user's language before selecting a prompt template:

- if the user is communicating in Chinese, use the Chinese template
- otherwise, default to the English template

When creating a Hermes gameplay runner job, prefer:

- `agentbox_skills/docs/HERMES_CRON_PROMPT.md`
- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

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
- if the user simply wants stable background operation, default to `every 30m`
- if the user asks to "change the gameplay goal", this skill should also be consulted; prefer updating the existing background job prompt and state files instead of only describing the change in the current chat
- background runner jobs should default to `deliver = local`

## Success Feedback

When the cron job is created or updated, tell the user:

- whether it was created or updated
- the job name
- the schedule interval
- the delivery strategy
- which skills were attached
- which prompt template was used
- where the runtime state is persisted
