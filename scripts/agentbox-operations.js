#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSPlayerRuntime } from "../runtime/player-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");

function usage() {
  return `Usage:
  agentbox-operations read-state [--role ADDRESS]
  agentbox-operations add-plan --goal TEXT --actions-json JSON [--role ADDRESS] [--priority N] [--source agent|user|cron|manual]
  agentbox-operations start-next [--role ADDRESS]
  agentbox-operations next-action [--role ADDRESS]
  agentbox-operations update-action --operation-id ID --action-id ID --status STATUS [--role ADDRESS] [--note TEXT]
  agentbox-operations finish-current [--role ADDRESS] [--status completed|failed|cancelled|blocked] [--note TEXT]
  agentbox-operations cancel-current [--role ADDRESS] [--note TEXT]
  agentbox-operations clear-completed [--role ADDRESS]
  agentbox-operations reconcile [--role ADDRESS] [--apply]

Options:
  --data-dir PATH     Override Agentbox local data directory
  --compact          Compact JSON output
  --help             Show this help
`;
}

function parseCli(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === null || value === true || value === "") {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function optionalString(flags, name) {
  if (!(name in flags)) return undefined;
  const value = flags[name];
  return value === true ? undefined : value;
}

function optionalInt(flags, name) {
  if (!(name in flags)) return undefined;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new Error(`Invalid integer for --${name}`);
  return value;
}

function optionalJson(flags, name) {
  if (!(name in flags)) return undefined;
  try {
    return JSON.parse(requireFlag(flags, name));
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error?.message || String(error)}`);
  }
}

function buildInvocation(command, flags) {
  switch (command) {
    case "read-state":
      return { toolName: "agentbox.operations.read_state", payload: { role: optionalString(flags, "role") } };
    case "add-plan":
      return {
        toolName: "agentbox.operations.add_plan",
        payload: {
          role: optionalString(flags, "role"),
          goal: requireFlag(flags, "goal"),
          actions: optionalJson(flags, "actions-json"),
          priority: optionalInt(flags, "priority"),
          source: optionalString(flags, "source"),
        },
      };
    case "start-next":
      return { toolName: "agentbox.operations.start_next", payload: { role: optionalString(flags, "role") } };
    case "next-action":
      return { toolName: "agentbox.operations.next_action", payload: { role: optionalString(flags, "role") } };
    case "update-action":
      return {
        toolName: "agentbox.operations.update_action",
        payload: {
          role: optionalString(flags, "role"),
          operationId: requireFlag(flags, "operation-id"),
          actionId: requireFlag(flags, "action-id"),
          status: requireFlag(flags, "status"),
          txHash: optionalString(flags, "tx-hash"),
          blockNumber: optionalInt(flags, "block-number"),
          chainId: optionalInt(flags, "chain-id"),
          errorCode: optionalString(flags, "error-code"),
          errorMessage: optionalString(flags, "error-message"),
          note: optionalString(flags, "note"),
        },
      };
    case "finish-current":
      return {
        toolName: "agentbox.operations.finish_current",
        payload: {
          role: optionalString(flags, "role"),
          status: optionalString(flags, "status"),
          note: optionalString(flags, "note"),
        },
      };
    case "cancel-current":
      return { toolName: "agentbox.operations.cancel_current", payload: { role: optionalString(flags, "role"), note: optionalString(flags, "note") } };
    case "clear-completed":
      return { toolName: "agentbox.operations.clear_completed", payload: { role: optionalString(flags, "role") } };
    case "reconcile":
      return { toolName: "agentbox.operations.reconcile", payload: { role: optionalString(flags, "role"), apply: Boolean(flags.apply) } };
    default:
      throw new Error(`Unknown operation command: ${command || "(missing)"}`);
  }
}

async function main() {
  const { positional, flags } = parseCli(process.argv.slice(2));
  if (!positional.length || flags.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (typeof flags["data-dir"] === "string" && flags["data-dir"].trim()) {
    process.env.AGENTBOX_DATA_DIR = flags["data-dir"].trim();
  }
  const runtime = new JSPlayerRuntime(PLUGIN_ROOT);
  try {
    const invocation = buildInvocation(positional[0], flags);
    const result = await runtime.invoke(invocation.toolName, invocation.payload);
    process.stdout.write(`${flags.compact ? JSON.stringify(result) : JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, errorCode: "CLI_USAGE_ERROR", errorMessage: error?.message || String(error) }, null, 2)}\n`);
    process.exit(2);
  }
}

await main();
