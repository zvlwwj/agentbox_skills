---
name: agentbox-cron-orchestrator
description: Use this skill when the user wants OpenClaw to create, update, or maintain a stable background cron job for Agentbox.
---

# Agentbox Cron Orchestrator

## Skill Description

This skill does not add new onchain gameplay tools. Instead, it guides the OpenClaw agent to:

- create a long-running background cron job for Agentbox
- update an existing cron job instead of creating duplicates
- use fixed-interval scheduling plus prompt-level `next_cron_job_time` skipping for stable operation

Use this skill when the user asks for:

- a background Agentbox runner
- a stable long-running cron job
- updating an existing Agentbox cron job prompt or schedule

## Important Constraints

### 1. Do not rely on an isolated cron job to edit its own schedule

An isolated cron agent usually does not have owner-only `cron.update` access.

Therefore:

- do not make self-editing schedule changes a hard dependency
- do not rely on the cron job to move its own next execution time

Use this pattern instead:

- create a fixed `every` cron job
- let the prompt decide whether to skip the current run based on `next_cron_job_time`

### 2. Prefer a named session

Use a named session such as:

- `session:agentbox-background-runner`

This helps preserve continuity and makes prompt/session debugging easier.

### 3. Delivery should usually be silent

For background Agentbox jobs, prefer:

- `delivery.mode = "none"`

This avoids runs being marked as failed due to missing outbound channels.

## Default Cron Strategy

When the user asks to create a background cron job, use these defaults:

- schedule kind: `every`
- interval: `600000ms` (every 10 minutes)
- `enabled: true`
- `deleteAfterRun: false`
- `sessionTarget: "session:agentbox-background-runner"`
- `payload.kind: "agentTurn"`
- `delivery.mode: "none"`
- `lightContext: true`

This means:

- the job wakes up every 10 minutes
- whether it actually performs onchain actions is controlled by the prompt's `next_cron_job_time`

## Prompt Source

Use this prompt template by default:

- `agentbox_skills/docs/OPENCLAW_CRON_PROMPT_CN.md`

Before creating the job, fill in the needed runtime context such as:

- `roleWallet`
- `owner`
- current time placeholders

If the user asks for a custom strategy, modify this template conservatively rather than replacing its structure.

## Create-vs-Update Priority

### 1. Check for an existing background job first

If a clearly matching Agentbox background job already exists:

- update it
- do not create a duplicate

### 2. Only create a new job when needed

When creating a new job, explicitly set:

- job name
- session target
- schedule kind and interval
- payload message
- delivery mode

### 3. If the user only wants to change the prompt

Prefer updating:

- `payload.message`
- and only the schedule fields that actually need to change

## Recommended Naming

Use these defaults unless the user says otherwise:

- job name: `agentbox-background-runner`
- session target: `session:agentbox-background-runner`

Keeping them aligned makes maintenance easier.

## Rules While Using This Skill

- explain outcomes to the user in semantic, plain language
- avoid creating duplicate background jobs
- prefer `every` instead of single-shot `at`
- prefer silent delivery unless the user explicitly wants announcements
- if the user simply wants stable background operation, default to a 10-minute interval

## What To Tell The User After Success

After creating or updating the cron job, clearly report:

- whether it was created or updated
- the job name
- the schedule type and interval
- the session target
- whether it runs silently
- which prompt template it uses

Suggested phrasing:

> Created the background cron job `agentbox-background-runner` with a fixed 10-minute schedule, bound to `session:agentbox-background-runner`, running silently. Whether a run performs onchain actions is controlled by `next_cron_job_time` inside the prompt.
