#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import { hermesDataDir } from "../runtime/common.js";
import { JSPlayerRuntime } from "../runtime/player-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");

const HERMES_AGENTBOX_HOME = process.env.AGENTBOX_HERMES_HOME || hermesDataDir();
const BRIDGE_PATH_PREFIX = "/plugins/agentbox-hermes/bridge";
const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = 18889;
const LAUNCH_AGENT_LABEL = "world.agentbox.hermes-bridge";
const LAUNCH_AGENT_PATH = path.join(os.homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
const BRIDGE_PID_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.pid");
const BRIDGE_RUNTIME_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.runtime.json");
const BRIDGE_LOG_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.log");
const BRIDGE_ERR_LOG_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.err.log");
const DEFAULT_ALLOWED_ORIGINS = [
  "https://agentbox.world",
  "https://www.agentbox.world",
  "http://127.0.0.1:8090",
  "http://localhost:8090",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

function usage() {
  return `Usage:
  agentbox-hermes signer prepare [--label LABEL] [--force] [--backup-confirmed] [--confirm-signer-replacement]
  agentbox-hermes signer import --private-key KEY [--label LABEL] [--force] [--backup-confirmed] [--confirm-signer-replacement]
  agentbox-hermes signer export
  agentbox-hermes signer read

  agentbox-hermes registration confirm [--profile-mode MODE] [--nickname NAME] [--gender ID]

  agentbox-hermes roles list-owned
  agentbox-hermes roles read-active
  agentbox-hermes roles select-active [--role-wallet ADDRESS | --role-id ID]
  agentbox-hermes roles clear-active

  agentbox-hermes operations read-state [--role ADDRESS]
  agentbox-hermes operations add-plan --goal TEXT --actions-json JSON [--priority N] [--source agent|user|cron|manual]
  agentbox-hermes operations start-next [--role ADDRESS]
  agentbox-hermes operations next-action [--role ADDRESS]
  agentbox-hermes operations update-action --operation-id ID --action-id ID --status STATUS [--note TEXT]
  agentbox-hermes operations finish-current [--role ADDRESS] [--status completed|failed|cancelled|blocked] [--note TEXT]
  agentbox-hermes operations cancel-current [--role ADDRESS] [--note TEXT]
  agentbox-hermes operations clear-completed [--role ADDRESS]
  agentbox-hermes operations reconcile [--role ADDRESS] [--apply]

  agentbox-hermes read role-snapshot [--role ADDRESS] [--source auto|chain|indexer]
  agentbox-hermes read world-static [--role ADDRESS] [--source auto|chain|indexer]
  agentbox-hermes read world-dynamic [--role ADDRESS] [--source auto|chain|indexer]
  agentbox-hermes read land [--land-id ID | --x X --y Y] [--source auto|chain|indexer]
  agentbox-hermes read last-mint
  agentbox-hermes read global-config [--source auto|chain|indexer]

  agentbox-hermes check gather [--role ADDRESS] --amount N
  agentbox-hermes check learn [--role ADDRESS] --npc-id ID
  agentbox-hermes check craft [--role ADDRESS] --recipe-id ID
  agentbox-hermes check finishable [--role ADDRESS]
  agentbox-hermes check trigger-mint [--role ADDRESS]
  agentbox-hermes check stabilize [--role ADDRESS]

  agentbox-hermes action move [--role ADDRESS] --x X --y Y
  agentbox-hermes action teleport [--role ADDRESS] --x X --y Y
  agentbox-hermes action learn [--role ADDRESS] --npc-id ID
  agentbox-hermes action gather [--role ADDRESS] --amount N
  agentbox-hermes action craft [--role ADDRESS] --recipe-id ID
  agentbox-hermes action attack [--role ADDRESS] --target-wallet ADDRESS
  agentbox-hermes action start-attack [--role ADDRESS] --target-wallet ADDRESS
  agentbox-hermes action finish [--role ADDRESS]
  agentbox-hermes action cancel [--role ADDRESS]
  agentbox-hermes action equip [--role ADDRESS] --equipment-id ID
  agentbox-hermes action unequip [--role ADDRESS] --slot ID
  agentbox-hermes action trigger-mint
  agentbox-hermes action stabilize [--role ADDRESS]
  agentbox-hermes action transfer [--role ADDRESS] --amount N

  agentbox-hermes bridge start
  agentbox-hermes bridge stop
  agentbox-hermes bridge restart
  agentbox-hermes bridge install-service
  agentbox-hermes bridge uninstall-service
  agentbox-hermes bridge status
  agentbox-hermes bridge token
  agentbox-hermes bridge rotate-token

Options:
  --pretty           Pretty-print JSON (default)
  --compact          Compact JSON
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
    if (!key) continue;
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

function optionalInt(flags, name) {
  if (!(name in flags)) return undefined;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new Error(`Invalid integer for --${name}`);
  return value;
}

function optionalString(flags, name) {
  if (!(name in flags)) return undefined;
  const value = flags[name];
  return value === true ? undefined : value;
}

function optionalJson(flags, name) {
  if (!(name in flags)) return undefined;
  const value = requireFlag(flags, name);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error?.message || String(error)}`);
  }
}

function boolFlag(flags, name) {
  return Boolean(flags[name]);
}

function bridgeConfigPath() {
  return path.join(HERMES_AGENTBOX_HOME, "bridge.json");
}

function randomBridgeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function readBridgeConfig() {
  const configPath = bridgeConfigPath();
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function createDefaultBridgeConfig() {
  return {
    enabled: true,
    token: randomBridgeToken(),
    host: DEFAULT_BRIDGE_HOST,
    port: DEFAULT_BRIDGE_PORT,
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    defaultSessionKey: "agentbox-game-chat",
    sseHeartbeatMs: 15000,
    allowPrivateKeyExport: true,
    createdAt: new Date().toISOString(),
  };
}

function normalizeAllowedOrigins(value) {
  const merged = new Set(DEFAULT_ALLOWED_ORIGINS);
  if (Array.isArray(value)) {
    for (const origin of value) {
      if (typeof origin === "string" && origin.trim() && origin.trim() !== "*") merged.add(origin.trim());
    }
  }
  return [...merged];
}

function writeBridgeConfig(config) {
  fs.mkdirSync(HERMES_AGENTBOX_HOME, { recursive: true });
  fs.writeFileSync(bridgeConfigPath(), `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

function ensureBridgeConfig() {
  const current = readBridgeConfig();
  const next = {
    ...createDefaultBridgeConfig(),
    ...(current ?? {}),
    enabled: current?.enabled !== false,
    token: typeof current?.token === "string" && current.token.trim() ? current.token.trim() : randomBridgeToken(),
    host: typeof current?.host === "string" && current.host.trim() ? current.host.trim() : DEFAULT_BRIDGE_HOST,
    port: Number.isFinite(Number(current?.port)) ? Number(current.port) : DEFAULT_BRIDGE_PORT,
    allowedOrigins: normalizeAllowedOrigins(current?.allowedOrigins),
    defaultSessionKey:
      typeof current?.defaultSessionKey === "string" && current.defaultSessionKey.trim()
        ? current.defaultSessionKey.trim()
        : "agentbox-game-chat",
    sseHeartbeatMs:
      Number.isFinite(Number(current?.sseHeartbeatMs)) && Number(current.sseHeartbeatMs) >= 1000
        ? Number(current.sseHeartbeatMs)
        : 15000,
    allowPrivateKeyExport: current?.allowPrivateKeyExport !== false,
  };
  writeBridgeConfig(next);
  return next;
}

function normalizeBridgeConfig(current) {
  if (!current) return null;
  return {
    ...createDefaultBridgeConfig(),
    ...current,
    enabled: current.enabled !== false,
    token: typeof current.token === "string" && current.token.trim() ? current.token.trim() : "",
    host: typeof current.host === "string" && current.host.trim() ? current.host.trim() : DEFAULT_BRIDGE_HOST,
    port: Number.isFinite(Number(current.port)) ? Number(current.port) : DEFAULT_BRIDGE_PORT,
    allowedOrigins: normalizeAllowedOrigins(current.allowedOrigins),
    defaultSessionKey:
      typeof current.defaultSessionKey === "string" && current.defaultSessionKey.trim()
        ? current.defaultSessionKey.trim()
        : "agentbox-game-chat",
    sseHeartbeatMs:
      Number.isFinite(Number(current.sseHeartbeatMs)) && Number(current.sseHeartbeatMs) >= 1000
        ? Number(current.sseHeartbeatMs)
        : 15000,
    allowPrivateKeyExport: current.allowPrivateKeyExport !== false,
  };
}

function bridgeBaseUrl(config) {
  return `http://${config?.host ?? DEFAULT_BRIDGE_HOST}:${config?.port ?? DEFAULT_BRIDGE_PORT}${BRIDGE_PATH_PREFIX}`;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readPidFile() {
  try {
    if (!fs.existsSync(BRIDGE_PID_PATH)) return null;
    const pid = Number(fs.readFileSync(BRIDGE_PID_PATH, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function cleanupBridgeRuntimeFiles() {
  for (const filePath of [BRIDGE_PID_PATH, BRIDGE_RUNTIME_PATH]) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // best-effort cleanup
    }
  }
}

function launchctlDomain() {
  return `gui/${process.getuid?.() ?? ""}`;
}

function runLaunchctl(args) {
  return spawnSync("launchctl", args, { encoding: "utf8" });
}

function isLaunchAgentInstalled() {
  return fs.existsSync(LAUNCH_AGENT_PATH);
}

function isLaunchAgentLoaded() {
  const result = runLaunchctl(["print", `${launchctlDomain()}/${LAUNCH_AGENT_LABEL}`]);
  return result.status === 0;
}

async function probeBridge(config) {
  const url = `${bridgeBaseUrl(config)}/status`;
  return await new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            ok: res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode ?? 0,
            payload: raw ? JSON.parse(raw) : null,
          });
        } catch {
          resolve({ ok: false, statusCode: res.statusCode ?? 0, payload: null });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("probe_timeout"));
    });
    req.on("error", (error) => {
      resolve({ ok: false, statusCode: 0, error: error.message });
    });
  });
}

async function waitForBridge(config, shouldRun) {
  const deadline = Date.now() + 5000;
  let lastProbe = null;
  while (Date.now() < deadline) {
    lastProbe = await probeBridge(config);
    if (Boolean(lastProbe.ok) === shouldRun) return lastProbe;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return lastProbe;
}

async function collectBridgeStatus() {
  const config = readBridgeConfig();
  const normalized = normalizeBridgeConfig(config);
  const pid = readPidFile();
  const pidAlive = isProcessAlive(pid);
  const runtime = readJsonFile(BRIDGE_RUNTIME_PATH);
  const probe = normalized ? await probeBridge(normalized) : { ok: false, error: "not_configured" };
  const stalePid = Boolean(pid && !pidAlive);
  if (stalePid) cleanupBridgeRuntimeFiles();
  return {
    ok: true,
    configured: Boolean(normalized),
    running: Boolean(probe.ok),
    pid,
    pidAlive,
    stalePid,
    launchAgent: {
      label: LAUNCH_AGENT_LABEL,
      path: LAUNCH_AGENT_PATH,
      installed: isLaunchAgentInstalled(),
      loaded: isLaunchAgentLoaded(),
    },
    configPath: bridgeConfigPath(),
    runtimePath: BRIDGE_RUNTIME_PATH,
    host: normalized?.host ?? DEFAULT_BRIDGE_HOST,
    port: normalized?.port ?? DEFAULT_BRIDGE_PORT,
    hasToken: Boolean(normalized?.token),
    baseUrl: normalized ? bridgeBaseUrl(normalized) : bridgeBaseUrl(createDefaultBridgeConfig()),
    probe,
    runtime,
  };
}

async function stopBridgeProcess() {
  const config = readBridgeConfig() ?? createDefaultBridgeConfig();
  if (isLaunchAgentLoaded()) {
    runLaunchctl(["bootout", launchctlDomain(), LAUNCH_AGENT_PATH]);
  }
  const pid = readPidFile();
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // process may already be gone
    }
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && isProcessAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  }
  await waitForBridge(config, false);
  cleanupBridgeRuntimeFiles();
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function launchAgentPlist() {
  const cliScript = path.join(__dirname, "agentbox-hermes.js");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(LAUNCH_AGENT_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(cliScript)}</string>
    <string>bridge</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENTBOX_HERMES_HOME</key>
    <string>${xmlEscape(HERMES_AGENTBOX_HOME)}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(PLUGIN_ROOT)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(BRIDGE_LOG_PATH)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(BRIDGE_ERR_LOG_PATH)}</string>
</dict>
</plist>
`;
}

async function installBridgeService() {
  const config = ensureBridgeConfig();
  fs.mkdirSync(path.dirname(LAUNCH_AGENT_PATH), { recursive: true });
  fs.mkdirSync(HERMES_AGENTBOX_HOME, { recursive: true });
  fs.writeFileSync(LAUNCH_AGENT_PATH, launchAgentPlist());
  if (isLaunchAgentLoaded()) {
    runLaunchctl(["bootout", launchctlDomain(), LAUNCH_AGENT_PATH]);
  }
  const bootstrap = runLaunchctl(["bootstrap", launchctlDomain(), LAUNCH_AGENT_PATH]);
  if (bootstrap.status !== 0) {
    throw new Error((bootstrap.stderr || bootstrap.stdout || "launchctl bootstrap failed").trim());
  }
  runLaunchctl(["kickstart", "-k", `${launchctlDomain()}/${LAUNCH_AGENT_LABEL}`]);
  await waitForBridge(config, true);
}

async function uninstallBridgeService() {
  await stopBridgeProcess();
  try {
    if (fs.existsSync(LAUNCH_AGENT_PATH)) fs.unlinkSync(LAUNCH_AGENT_PATH);
  } catch {
    // best-effort cleanup
  }
}

async function handleBridgeCommand(command, flags) {
  if (command === "start") {
    const bridgePath = path.join(__dirname, "agentbox-hermes-bridge.js");
    await new Promise((resolve) => {
      const proc = spawn(process.execPath, [bridgePath], {
        cwd: PLUGIN_ROOT,
        env: { ...process.env, AGENTBOX_HERMES_HOME: HERMES_AGENTBOX_HOME },
        stdio: "inherit",
      });
      proc.on("exit", (code) => {
        process.exitCode = code ?? 0;
        resolve();
      });
      proc.on("error", (error) => {
        process.exitCode = 2;
        process.stderr.write(`${error?.message || String(error)}\n`);
        resolve();
      });
    });
    return true;
  }
  if (command === "stop") {
    await stopBridgeProcess();
    process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
    return true;
  }
  if (command === "restart") {
    await stopBridgeProcess();
    if (isLaunchAgentInstalled()) {
      await installBridgeService();
      process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
      return true;
    }
    const bridgePath = path.join(__dirname, "agentbox-hermes-bridge.js");
    const proc = spawn(process.execPath, [bridgePath], {
      cwd: PLUGIN_ROOT,
      env: { ...process.env, AGENTBOX_HERMES_HOME: HERMES_AGENTBOX_HOME },
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
    await waitForBridge(ensureBridgeConfig(), true);
    process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
    return true;
  }
  if (command === "install-service") {
    await installBridgeService();
    process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
    return true;
  }
  if (command === "uninstall-service") {
    await uninstallBridgeService();
    process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
    return true;
  }
  if (command === "status") {
    process.stdout.write(`${JSON.stringify(await collectBridgeStatus(), null, flags.compact ? 0 : 2)}\n`);
    return true;
  }
  if (command === "token" || command === "rotate-token") {
    const current = normalizeBridgeConfig(readBridgeConfig()) ?? ensureBridgeConfig();
    const token = command === "rotate-token" || !current.token ? randomBridgeToken() : current.token;
    if (command === "rotate-token" || !current.token) {
      writeBridgeConfig({ ...current, token });
    }
    process.stdout.write(flags.compact ? `${JSON.stringify({ token })}\n` : `${JSON.stringify({ token }, null, 2)}\n`);
    return true;
  }
  return false;
}

function buildInvocation(positional, flags) {
  const [group, command] = positional;
  if (!group || flags.help) return null;

  switch (group) {
    case "signer":
      switch (command) {
        case "prepare":
          return {
            toolName: "agentbox.signer.prepare",
            payload: {
              label: optionalString(flags, "label"),
              force: boolFlag(flags, "force"),
              backupConfirmed: boolFlag(flags, "backup-confirmed"),
              confirmSignerReplacement: boolFlag(flags, "confirm-signer-replacement"),
            },
          };
        case "import":
          return {
            toolName: "agentbox.signer.import",
            payload: {
              privateKey: requireFlag(flags, "private-key"),
              label: optionalString(flags, "label"),
              force: boolFlag(flags, "force"),
              backupConfirmed: boolFlag(flags, "backup-confirmed"),
              confirmSignerReplacement: boolFlag(flags, "confirm-signer-replacement"),
            },
          };
        case "export":
          return { toolName: "agentbox.signer.export", payload: {} };
        case "read":
          return { toolName: "agentbox.signer.read", payload: {} };
        default:
          throw new Error(`Unknown signer command: ${command || "(missing)"}`);
      }
    case "roles":
      switch (command) {
        case "list-owned":
          return { toolName: "agentbox.roles.list_owned", payload: {} };
        case "read-active":
          return { toolName: "agentbox.roles.read_active", payload: {} };
        case "select-active":
          return {
            toolName: "agentbox.roles.select_active",
            payload: {
              roleWallet: optionalString(flags, "role-wallet"),
              roleId: optionalInt(flags, "role-id"),
            },
          };
        case "clear-active":
          return { toolName: "agentbox.roles.clear_active", payload: {} };
        default:
          throw new Error(`Unknown roles command: ${command || "(missing)"}`);
      }
    case "operations":
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
          return { toolName: "agentbox.operations.reconcile", payload: { role: optionalString(flags, "role"), apply: boolFlag(flags, "apply") } };
        default:
          throw new Error(`Unknown operations command: ${command || "(missing)"}`);
      }
    case "read":
      switch (command) {
        case "role-snapshot":
          return { toolName: "agentbox.skills.read_role_snapshot", payload: { role: optionalString(flags, "role"), source: optionalString(flags, "source") } };
        case "world-static":
          return { toolName: "agentbox.skills.read_world_static_info", payload: { role: optionalString(flags, "role"), source: optionalString(flags, "source") } };
        case "world-dynamic":
          return { toolName: "agentbox.skills.read_world_dynamic_info", payload: { role: optionalString(flags, "role"), source: optionalString(flags, "source") } };
        case "land":
          return {
            toolName: "agentbox.skills.read_land",
            payload: {
              landId: optionalInt(flags, "land-id"),
              x: optionalInt(flags, "x"),
              y: optionalInt(flags, "y"),
              source: optionalString(flags, "source"),
            },
          };
        case "last-mint":
          return { toolName: "agentbox.skills.read_last_mint", payload: {} };
        case "global-config":
          return { toolName: "agentbox.skills.read_global_config", payload: { source: optionalString(flags, "source") } };
        default:
          throw new Error(`Unknown read command: ${command || "(missing)"}`);
      }
    case "check":
      switch (command) {
        case "gather":
          return { toolName: "agentbox.skills.check_gather_prerequisites", payload: { role: optionalString(flags, "role"), amount: Number(requireFlag(flags, "amount")) } };
        case "learn":
          return { toolName: "agentbox.skills.check_learning_prerequisites", payload: { role: optionalString(flags, "role"), npcId: Number(requireFlag(flags, "npc-id")) } };
        case "craft":
          return { toolName: "agentbox.skills.check_crafting_prerequisites", payload: { role: optionalString(flags, "role"), recipeId: Number(requireFlag(flags, "recipe-id")) } };
        case "finishable":
          return { toolName: "agentbox.skills.check_finishable", payload: { role: optionalString(flags, "role") } };
        case "trigger-mint":
          return { toolName: "agentbox.skills.check_trigger_mint_prerequisites", payload: { role: optionalString(flags, "role") } };
        case "stabilize":
          return { toolName: "agentbox.skills.check_stabilize_prerequisites", payload: { role: optionalString(flags, "role") } };
        default:
          throw new Error(`Unknown check command: ${command || "(missing)"}`);
      }
    case "action":
      switch (command) {
        case "move":
          return { toolName: "agentbox.skills.move.instant", payload: { role: optionalString(flags, "role"), x: Number(requireFlag(flags, "x")), y: Number(requireFlag(flags, "y")) } };
        case "teleport":
          return { toolName: "agentbox.skills.teleport.start", payload: { role: optionalString(flags, "role"), x: Number(requireFlag(flags, "x")), y: Number(requireFlag(flags, "y")) } };
        case "learn":
          return { toolName: "agentbox.skills.learn.npc.start", payload: { role: optionalString(flags, "role"), npcId: Number(requireFlag(flags, "npc-id")) } };
        case "gather":
          return { toolName: "agentbox.skills.gather.start", payload: { role: optionalString(flags, "role"), amount: Number(requireFlag(flags, "amount")) } };
        case "craft":
          return { toolName: "agentbox.skills.craft.start", payload: { role: optionalString(flags, "role"), recipeId: Number(requireFlag(flags, "recipe-id")) } };
        case "attack":
          return { toolName: "agentbox.skills.combat.attack", payload: { role: optionalString(flags, "role"), targetWallet: requireFlag(flags, "target-wallet") } };
        case "start-attack":
          return { toolName: "agentbox.skills.combat.start_attack", payload: { role: optionalString(flags, "role"), targetWallet: requireFlag(flags, "target-wallet") } };
        case "finish":
          return { toolName: "agentbox.skills.finish_current_action", payload: { role: optionalString(flags, "role") } };
        case "cancel":
          return { toolName: "agentbox.skills.cancel_current_action", payload: { role: optionalString(flags, "role") } };
        case "equip":
          return { toolName: "agentbox.skills.equip.put_on", payload: { role: optionalString(flags, "role"), equipmentId: Number(requireFlag(flags, "equipment-id")) } };
        case "unequip":
          return { toolName: "agentbox.skills.equip.take_off", payload: { role: optionalString(flags, "role"), slot: Number(requireFlag(flags, "slot")) } };
        case "trigger-mint":
          return { toolName: "agentbox.skills.trigger_mint", payload: {} };
        case "stabilize":
          return { toolName: "agentbox.skills.stabilize_balance", payload: { role: optionalString(flags, "role") } };
        case "transfer":
          return { toolName: "agentbox.skills.transfer_agc_to_owner", payload: { role: optionalString(flags, "role"), amount: Number(requireFlag(flags, "amount")) } };
        default:
          throw new Error(`Unknown action command: ${command || "(missing)"}`);
      }
    default:
      if (group === "registration") {
        switch (command) {
          case "confirm":
            return {
              toolName: "agentbox.registration.confirm",
              payload: {
                profileMode: optionalString(flags, "profile-mode"),
                nickname: optionalString(flags, "nickname"),
                gender: optionalInt(flags, "gender"),
              },
            };
          default:
            throw new Error(`Unknown registration command: ${command || "(missing)"}`);
        }
      }
      throw new Error(`Unknown command group: ${group}`);
  }
}

async function main() {
  const { positional, flags } = parseCli(process.argv.slice(2));
  if (!positional.length || flags.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  if (positional[0] === "bridge") {
    try {
      const handled = await handleBridgeCommand(positional[1], flags);
      if (!handled) throw new Error(`Unknown bridge command: ${positional[1] || "(missing)"}`);
      process.exit(0);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ ok: false, errorMessage: error?.message || String(error) }, null, 2)}\n`);
      process.exit(2);
    }
  }

  fs.mkdirSync(HERMES_AGENTBOX_HOME, { recursive: true });
  const runtime = new JSPlayerRuntime(PLUGIN_ROOT, {
    settings: {
      dataDir: HERMES_AGENTBOX_HOME,
    },
  });

  try {
    const invocation = buildInvocation(positional, flags);
    if (!invocation) {
      process.stdout.write(usage());
      process.exit(0);
    }
    const result = await runtime.invoke(invocation.toolName, invocation.payload);
    const output = flags.compact ? JSON.stringify(result) : JSON.stringify(result, null, 2);
    process.stdout.write(`${output}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    const payload = {
      ok: false,
      errorCode: "CLI_USAGE_ERROR",
      errorMessage: error?.message || String(error),
      usage: usage(),
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(2);
  }
}

await main();
