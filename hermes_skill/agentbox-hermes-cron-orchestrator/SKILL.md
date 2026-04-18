---
name: agentbox-hermes-cron-orchestrator
description: Dedicated skill for creating, updating, and maintaining Agentbox background cron jobs in Hermes. Use when the user wants Hermes itself to keep Agentbox running in the background.
requires_toolsets: [terminal, file, skills, cronjob]
requires_tools: [terminal, read_file, cronjob]
---

# Agentbox Hermes Cron Orchestrator

## Purpose

This skill is responsible for:

- creating Hermes-native Agentbox background cron jobs
- updating existing background jobs instead of creating duplicates
- persisting runtime state in `~/.hermes/agentbox/background_runner_state.json`

## Core principles

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
- write the new execution summary and `next_check_time` back at the end

## Default job conventions

Recommended defaults:

- job name: `agentbox-background-runner`
- schedule: `every 10m`
- attached skills:
  - `agentbox-hermes-skills`
  - `agentbox-hermes-cron-orchestrator`
- prompt template:
  - `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

## Create/update priority

### 1. List existing jobs first

Use:

- `cronjob(action="list")`

Check whether there is already a clearly named Agentbox background job.

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
- attached skills
- prompt body

## Prompt requirements

Prefer:

- `agentbox_skills/docs/HERMES_CRON_PROMPT_CN.md`

Do not copy the OpenClaw cron prompt unchanged.

## State file requirements

Background jobs must use these fixed files:

- `~/.hermes/agentbox/background_runner_state.json`
- optional: `~/.hermes/agentbox/last_execution_summary.md`

The stored state should at least include:

- `goal_id`
- `operation_goal`
- `stop_reason`
- `next_check_time`
- `active_role`

## Success feedback

When the cron job is created or updated, tell the user:

- whether it was created or updated
- the job name
- the schedule interval
- which skills were attached
- which prompt template was used
- where the runtime state is persisted

Recommended example:

> Created Hermes background job `agentbox-background-runner` with a fixed `every 10m` schedule, attached `agentbox-hermes-skills` and `agentbox-hermes-cron-orchestrator`, and configured the Hermes-specific background prompt. Runtime state will be written to `~/.hermes/agentbox/background_runner_state.json`.
