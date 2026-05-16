#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hermesDataDir } from "../runtime/common.js";
import { JSPlayerRuntime } from "../runtime/player-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const HERMES_AGENTBOX_HOME = process.env.AGENTBOX_HERMES_HOME || hermesDataDir();
const DEFAULT_PORT = 18889;
const DEFAULT_BRIDGE_PATH_PREFIX = "/plugins/agentbox-hermes/bridge";
const DEFAULT_SESSION_KEY = "agentbox-game-chat";
const DEFAULT_SSE_HEARTBEAT_MS = 15000;
const DEFAULT_PAIRING_TTL_MS = 2 * 60 * 1000;
const DEFAULT_STREAM_TICKET_TTL_MS = 30 * 1000;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const SPAWN_COMMAND_TIMEOUT_MS = 10000;
const AGENTBOX_BACKGROUND_JOB_NAME = "agentbox-background-runner";
const AGENTBOX_BACKGROUND_DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://agentbox.world",
  "https://www.agentbox.world",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8090",
  "http://localhost:8090",
];

const CONFIG_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.json");
const CHAT_HISTORY_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge_chat_history.jsonl");
const BRIDGE_PID_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.pid");
const BRIDGE_RUNTIME_PATH = path.join(HERMES_AGENTBOX_HOME, "bridge.runtime.json");

function resolveHermesCommand() {
  const candidates = [
    process.env.HERMES_CLI,
    path.join(os.homedir(), ".local", "bin", "hermes"),
    path.join(os.homedir(), ".hermes", "hermes-agent", "venv", "bin", "hermes"),
    "hermes",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "hermes") return candidate;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore inaccessible candidates
    }
  }
  return "hermes";
}

const HERMES_CLI = resolveHermesCommand();

function randomBridgeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultConfig() {
  return {
    enabled: true,
    token: randomBridgeToken(),
    host: "127.0.0.1",
    port: DEFAULT_PORT,
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    defaultSessionKey: DEFAULT_SESSION_KEY,
    sseHeartbeatMs: DEFAULT_SSE_HEARTBEAT_MS,
    allowPrivateKeyExport: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeStringArray(value, fallback) {
  const merged = new Set(fallback);
  if (!Array.isArray(value)) return [...merged];
  const normalized = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  for (const item of normalized) {
    if (item !== "*") merged.add(item);
  }
  return [...merged];
}

async function ensureConfig() {
  await fsp.mkdir(HERMES_AGENTBOX_HOME, { recursive: true });
  try {
    const parsed = JSON.parse(await fsp.readFile(CONFIG_PATH, "utf8"));
    const next = {
      ...createDefaultConfig(),
      ...parsed,
      enabled: parsed.enabled !== false,
      token: typeof parsed.token === "string" && parsed.token.trim() ? parsed.token.trim() : randomBridgeToken(),
      host: typeof parsed.host === "string" && parsed.host.trim() ? parsed.host.trim() : "127.0.0.1",
      port: Number.isFinite(Number(parsed.port)) ? Number(parsed.port) : DEFAULT_PORT,
      allowedOrigins: normalizeStringArray(parsed.allowedOrigins, DEFAULT_ALLOWED_ORIGINS),
      defaultSessionKey:
        typeof parsed.defaultSessionKey === "string" && parsed.defaultSessionKey.trim()
          ? parsed.defaultSessionKey.trim()
          : DEFAULT_SESSION_KEY,
      sseHeartbeatMs:
        Number.isFinite(Number(parsed.sseHeartbeatMs)) && Number(parsed.sseHeartbeatMs) >= 1000
          ? Number(parsed.sseHeartbeatMs)
          : DEFAULT_SSE_HEARTBEAT_MS,
      allowPrivateKeyExport: parsed.allowPrivateKeyExport !== false,
      updatedAt: parsed.updatedAt || nowIso(),
    };
    await writeConfig(next);
    return next;
  } catch {
    const config = createDefaultConfig();
    await writeConfig(config);
    return config;
  }
}

async function loadConfig() {
  await fsp.mkdir(HERMES_AGENTBOX_HOME, { recursive: true });
  try {
    const parsed = JSON.parse(await fsp.readFile(CONFIG_PATH, "utf8"));
    return {
      ...createDefaultConfig(),
      ...parsed,
      enabled: parsed.enabled !== false,
      token: typeof parsed.token === "string" && parsed.token.trim() ? parsed.token.trim() : "",
      host: typeof parsed.host === "string" && parsed.host.trim() ? parsed.host.trim() : "127.0.0.1",
      port: Number.isFinite(Number(parsed.port)) ? Number(parsed.port) : DEFAULT_PORT,
      allowedOrigins: normalizeStringArray(parsed.allowedOrigins, DEFAULT_ALLOWED_ORIGINS),
      defaultSessionKey:
        typeof parsed.defaultSessionKey === "string" && parsed.defaultSessionKey.trim()
          ? parsed.defaultSessionKey.trim()
          : DEFAULT_SESSION_KEY,
      sseHeartbeatMs:
        Number.isFinite(Number(parsed.sseHeartbeatMs)) && Number(parsed.sseHeartbeatMs) >= 1000
          ? Number(parsed.sseHeartbeatMs)
          : DEFAULT_SSE_HEARTBEAT_MS,
      allowPrivateKeyExport: parsed.allowPrivateKeyExport !== false,
    };
  } catch {
    return ensureConfig();
  }
}

async function writeConfig(config) {
  await fsp.mkdir(HERMES_AGENTBOX_HOME, { recursive: true });
  await fsp.writeFile(CONFIG_PATH, `${JSON.stringify({ ...config, updatedAt: nowIso() }, null, 2)}\n`);
}

async function writeRuntimeFiles(config) {
  await fsp.mkdir(HERMES_AGENTBOX_HOME, { recursive: true });
  await fsp.writeFile(BRIDGE_PID_PATH, `${process.pid}\n`);
  await fsp.writeFile(
    BRIDGE_RUNTIME_PATH,
    `${JSON.stringify(
      {
        pid: process.pid,
        startedAt: nowIso(),
        host: config.host,
        port: config.port,
        baseUrl: `http://${config.host}:${config.port}${DEFAULT_BRIDGE_PATH_PREFIX}`,
        version: "1",
      },
      null,
      2
    )}\n`
  );
}

async function cleanupRuntimeFiles() {
  for (const filePath of [BRIDGE_PID_PATH, BRIDGE_RUNTIME_PATH]) {
    try {
      await fsp.unlink(filePath);
    } catch {
      // best-effort cleanup
    }
  }
}

function createCorsHeaders(origin, config) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "false",
    Vary: "Origin",
  };
}

function isOriginAllowed(origin, config) {
  if (!origin) return true;
  return config.allowedOrigins.includes(origin);
}

function writeJson(res, statusCode, payload, origin, config) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...createCorsHeaders(origin, config),
  });
  res.end(body);
}

function writeText(res, statusCode, text, origin, config) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...createCorsHeaders(origin, config),
  });
  res.end(text);
}

function writeHtml(res, statusCode, html, origin, config) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "X-Frame-Options": "DENY",
    ...createCorsHeaders(origin, config),
  });
  res.end(html);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error("json_body_too_large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  return url.searchParams.get("token")?.trim() || "";
}

function runtimeData(result) {
  return result?.data && typeof result.data === "object" ? result.data : {};
}

function formatBridgeWarning(warning, fallback = null) {
  if (typeof warning === "string") return warning;
  if (warning?.errorMessage) return warning.errorMessage;
  if (warning?.errorCode) return warning.errorCode;
  return fallback;
}

function writeRuntimeResult(res, origin, config, result, formatter = null) {
  if (!result?.ok) {
    writeJson(
      res,
      400,
      {
        ok: false,
        error: result?.errorCode || "agentbox_runtime_error",
        message: result?.errorMessage || result?.summary || "Agentbox runtime action failed",
        retryable: Boolean(result?.retryable),
        data: runtimeData(result),
      },
      origin,
      config
    );
    return;
  }
  writeJson(res, 200, formatter ? formatter(result) : { ok: true, ...runtimeData(result) }, origin, config);
}

function formatBridgeActiveRole(runtimeResult) {
  const data = runtimeData(runtimeResult);
  const activeRole = data.activeRole && typeof data.activeRole === "object" ? data.activeRole : null;
  if (!activeRole) {
    return {
      ok: true,
      hasActiveRole: false,
      isOwnedByActiveSigner: Boolean(data.isOwnedByActiveSigner),
      warning: formatBridgeWarning(data.warning, "missing_active_role"),
      activeRole: null,
    };
  }
  return {
    ok: true,
    hasActiveRole: Boolean(data.hasActiveRole),
    isOwnedByActiveSigner: Boolean(data.isOwnedByActiveSigner),
    warning: formatBridgeWarning(data.warning),
    activeRole: {
      roleId: activeRole.roleId ?? null,
      roleWallet: activeRole.roleWallet ?? "",
      ownerAddress: activeRole.ownerAddress ?? data.ownerAddress ?? "",
      x: activeRole.x ?? null,
      y: activeRole.y ?? null,
      state: activeRole.state ?? null,
      stateName: activeRole.stateName ?? "",
      nickname: activeRole.nickname ?? "",
    },
  };
}

function formatBridgeLocalAccountStatus(runtime) {
  const signerRecord = runtime?.signers?.loadRecord?.() || null;
  const activeRole = runtime?.activeRoles?.loadRecord?.() || null;
  const ownedRoles = signerRecord?.address ? runtime?.ownedRoles?.loadForOwner?.(signerRecord.address) || [] : [];
  const activeRoleOwnedBySigner = Boolean(
    signerRecord?.address &&
    activeRole?.ownerAddress &&
    String(signerRecord.address).toLowerCase() === String(activeRole.ownerAddress).toLowerCase()
  );
  return {
    ok: true,
    signer: {
      exists: Boolean(signerRecord?.address),
      signerId: signerRecord?.signer_id ?? null,
      ownerAddress: signerRecord?.address ?? null,
      label: signerRecord?.label ?? null,
    },
    activeRole: activeRole?.roleWallet ? activeRole : null,
    hasActiveRole: Boolean(activeRole?.roleWallet),
    activeRoleOwnedBySigner,
    ownedRolesCount: ownedRoles.length,
    warning: null,
  };
}

function formatBridgeSigner(result, { includePrivateKey = false } = {}) {
  const data = runtimeData(result);
  const signer = data.signer && typeof data.signer === "object" ? data.signer : data.data && typeof data.data === "object" ? data.data : data;
  return {
    ok: true,
    signer: {
      exists: Boolean(signer?.address),
      signerId: signer?.signerId ?? null,
      ownerAddress: signer?.address ?? null,
      label: signer?.label ?? null,
      hasPrivateKey: Boolean(signer?.hasPrivateKey || signer?.privateKey),
      ...(includePrivateKey && signer?.privateKey ? { privateKey: signer.privateKey } : {}),
    },
    ownedRolesCount: Number(data.ownedRolesCount ?? 0),
    activeRole: data.activeRole ?? null,
    ownedRoles: Array.isArray(data.ownedRoles) ? data.ownedRoles : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

function formatBridgeLocalRoles(runtime) {
  const signerRecord = runtime?.signers?.loadRecord?.() || null;
  const activeRole = runtime?.activeRoles?.loadRecord?.() || null;
  const activeRoleWallet = activeRole?.roleWallet?.toLowerCase() || null;
  const cachedRoles = signerRecord?.address ? runtime?.ownedRoles?.loadForOwner?.(signerRecord.address) || [] : [];
  const ownedRoles = cachedRoles.map((role) => ({
    ...role,
    isActive: Boolean(activeRoleWallet && role.roleWallet.toLowerCase() === activeRoleWallet),
  }));
  return {
    ok: true,
    ownerAddress: signerRecord?.address ?? activeRole?.ownerAddress ?? null,
    activeRole: activeRole?.roleWallet ? activeRole : null,
    ownedRolesCount: ownedRoles.length,
    ownedRoles,
  };
}

function formatBridgeRegistration(result) {
  const data = runtimeData(result);
  return {
    ok: true,
    status: data.registrationStatus ?? "unknown",
    stage: data.registrationStage ?? null,
    activeRole: data.activeRole ?? null,
    ownedRolesCount: Number(data.ownedRolesCount ?? 0),
    roleId: data.roleId ?? data.activeRole?.roleId ?? null,
    roleWallet: data.role ?? data.activeRole?.roleWallet ?? null,
    depositAddress: data.depositAddress ?? null,
    message: data.message ?? result.summary ?? "",
    txHash: result.txHash ?? null,
    chainId: result.chainId ?? null,
    blockNumber: result.blockNumber ?? null,
    requiredBalanceEth: data.requiredBalanceEth ?? null,
    currentBalanceEth: data.currentBalanceEth ?? data.activeSignerBalanceEth ?? null,
    shortfallEth: data.shortfallEth ?? null,
  };
}

function formatBridgeOperationState(result) {
  const data = runtimeData(result);
  const state = data.data && typeof data.data === "object" ? data.data : data;
  return {
    ok: true,
    version: state.version ?? 1,
    role: state.role ?? null,
    currentOperation: state.currentOperation ?? null,
    plannedOperations: Array.isArray(state.plannedOperations) ? state.plannedOperations : [],
    completedOperations: Array.isArray(state.completedOperations) ? state.completedOperations : [],
    customStrategy: typeof state.customStrategy === "string" ? state.customStrategy : "",
    customStrategyUpdatedAt: state.customStrategyUpdatedAt ?? null,
    updatedAt: state.updatedAt ?? null,
  };
}

async function appendChatMessage(message) {
  await fsp.mkdir(HERMES_AGENTBOX_HOME, { recursive: true });
  await fsp.appendFile(CHAT_HISTORY_PATH, `${JSON.stringify(message)}\n`);
}

async function loadChatHistory(limit = 50) {
  try {
    const lines = (await fsp.readFile(CHAT_HISTORY_PATH, "utf8")).split("\n").filter(Boolean);
    return lines
      .slice(-Math.max(1, Math.min(200, limit)))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: path.resolve(PLUGIN_ROOT, ".."),
      env: {
        ...process.env,
        AGENTBOX_HERMES_HOME: HERMES_AGENTBOX_HOME,
      },
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000).unref?.();
    }, options.timeoutMs ?? SPAWN_COMMAND_TIMEOUT_MS);
    timeout.unref?.();
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, code: -1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function normalizeHermesChatOutput(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("Session ID:") && !line.startsWith("Session:"))
    .join("\n")
    .trim();
}

function parseHermesCronList(text) {
  const jobs = [];
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const header = line.match(/^\s*([a-f0-9]{8,})\s+\[(active|paused|disabled|inactive)\]/i);
    if (header) {
      if (current) jobs.push(current);
      current = { id: header[1], enabled: header[2].toLowerCase() === "active", state: {} };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*(Name|Schedule|Next run|Deliver|Skills|Last run):\s*(.*)$/);
    if (!field) continue;
    const key = field[1];
    const value = field[2].trim();
    if (key === "Name") current.name = value;
    if (key === "Schedule") current.schedule = value;
    if (key === "Next run") current.nextRun = value;
    if (key === "Deliver") current.deliver = value;
    if (key === "Skills") current.skills = value;
    if (key === "Last run") {
      const parts = value.split(/\s{2,}/);
      current.state.lastRunAt = parts[0] || null;
      current.state.lastRunStatus = parts[1] || null;
    }
  }
  if (current) jobs.push(current);
  return jobs;
}

async function listHermesCronJobs() {
  const result = await spawnCommand(HERMES_CLI, ["cron", "list", "--all"]);
  if (!result.ok) return [];
  return parseHermesCronList(result.stdout);
}

async function findBackgroundJob() {
  const jobs = await listHermesCronJobs();
  return jobs.find((job) => job.name === AGENTBOX_BACKGROUND_JOB_NAME) || null;
}

function normalizeIntervalMinutes(value, fallback = AGENTBOX_BACKGROUND_DEFAULT_INTERVAL_MINUTES) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1440, Math.max(1, Math.round(numeric)));
}

function formatBackgroundJobStatus(job, customStrategy = "") {
  if (!job) {
    return {
      ok: true,
      exists: false,
      enabled: false,
      jobId: null,
      name: AGENTBOX_BACKGROUND_JOB_NAME,
      schedule: null,
      intervalMinutes: null,
      sessionKey: "session:agentbox-background-runner",
      customStrategy,
      lastRunAt: null,
      lastRunStatus: null,
    };
  }
  const intervalMatch = String(job.schedule || "").match(/(?:every|once in)\s+(\d+)m/i);
  return {
    ok: true,
    exists: true,
    enabled: job.enabled !== false,
    jobId: job.id || null,
    name: job.name || AGENTBOX_BACKGROUND_JOB_NAME,
    schedule: job.schedule || null,
    intervalMinutes: intervalMatch ? Number(intervalMatch[1]) : null,
    sessionKey: "session:agentbox-background-runner",
    customStrategy,
    lastRunAt: job.state?.lastRunAt ? Date.parse(job.state.lastRunAt) || null : null,
    lastRunStatus: job.state?.lastRunStatus || null,
  };
}

async function readCustomStrategy(runtime) {
  const result = await runtime.invoke("agentbox.operations.read_state", {});
  return runtimeData(result).customStrategy || runtimeData(result).data?.customStrategy || "";
}

async function buildHermesBackgroundPrompt() {
  const templatePath = path.join(PLUGIN_ROOT, "docs", "HERMES_CRON_PROMPT.md");
  try {
    return (await fsp.readFile(templatePath, "utf8")).trim();
  } catch {
    return "Run Agentbox background gameplay for the active role. Read Operation Manager state first and execute one safe next action.";
  }
}

async function createOrUpdateBackgroundJob(runtime, body = {}) {
  const intervalMinutes = normalizeIntervalMinutes(body.intervalMinutes);
  const prompt = await buildHermesBackgroundPrompt();
  const existing = await findBackgroundJob();
  if (typeof body.customStrategy === "string") {
    await runtime.invoke("agentbox.operations.update_strategy", { customStrategy: body.customStrategy });
  }
  if (existing?.id) {
    const editResult = await spawnCommand(HERMES_CLI, [
      "cron",
      "edit",
      existing.id,
      "--schedule",
      `every ${intervalMinutes}m`,
      "--prompt",
      prompt,
      "--name",
      AGENTBOX_BACKGROUND_JOB_NAME,
      "--deliver",
      "local",
      "--repeat",
      "0",
      "--skill",
      "agentbox-hermes-skills",
    ]);
    if (!editResult.ok) throw new Error(editResult.stderr || editResult.stdout || "Hermes cron edit failed");
    const resumeResult = await spawnCommand(HERMES_CLI, ["cron", "resume", existing.id]);
    if (!resumeResult.ok) throw new Error(resumeResult.stderr || resumeResult.stdout || "Hermes cron resume failed");
    return findBackgroundJob();
  }
  const createResult = await spawnCommand(HERMES_CLI, [
    "cron",
    "create",
    `every ${intervalMinutes}m`,
    prompt,
    "--name",
    AGENTBOX_BACKGROUND_JOB_NAME,
    "--deliver",
    "local",
    "--repeat",
    "0",
    "--skill",
    "agentbox-hermes-skills",
  ]);
  if (!createResult.ok) throw new Error(createResult.stderr || createResult.stdout || "Hermes cron create failed");
  return findBackgroundJob();
}

class PairingManager {
  constructor(configProvider) {
    this.configProvider = configProvider;
    this.requests = new Map();
  }

  cleanup() {
    const now = Date.now();
    for (const [id, request] of this.requests.entries()) {
      if (request.expiresAt <= now || request.status === "consumed") this.requests.delete(id);
    }
  }

  async start(origin) {
    this.cleanup();
    const config = await this.configProvider();
    const request = {
      pairingId: crypto.randomUUID(),
      token: config.token,
      origin: origin || "unknown-origin",
      createdAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_PAIRING_TTL_MS,
      status: "pending",
      approveSecret: crypto.randomBytes(18).toString("hex"),
      approvedAt: 0,
    };
    this.requests.set(request.pairingId, request);
    return request;
  }

  get(pairingId) {
    this.cleanup();
    return this.requests.get(pairingId) || null;
  }

  approve(pairingId, approveSecret) {
    const request = this.get(pairingId);
    if (!request) return { ok: false, error: "pairing_not_found" };
    if (request.status !== "pending") return { ok: false, error: "pairing_not_pending" };
    if (request.approveSecret !== approveSecret) return { ok: false, error: "invalid_pairing_secret" };
    request.status = "approved";
    request.approvedAt = Date.now();
    return { ok: true, request };
  }

  complete(pairingId) {
    const request = this.get(pairingId);
    if (!request) return { ok: false, error: "pairing_not_found" };
    if (request.status === "pending") return { ok: true, state: "pending", expiresAt: request.expiresAt };
    if (request.status === "approved") {
      request.status = "consumed";
      return { ok: true, state: "approved", token: request.token, approvedAt: request.approvedAt };
    }
    return { ok: false, error: "pairing_consumed" };
  }
}

class StreamTicketManager {
  constructor() {
    this.tickets = new Map();
  }

  create(sessionKey) {
    const ticket = crypto.randomBytes(24).toString("hex");
    const expiresAt = Date.now() + DEFAULT_STREAM_TICKET_TTL_MS;
    this.tickets.set(ticket, { sessionKey, expiresAt });
    return { ticket, expiresAt };
  }

  consume(ticket) {
    const record = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!record || record.expiresAt <= Date.now()) return null;
    return record;
  }
}

class SseHub {
  constructor(configProvider) {
    this.configProvider = configProvider;
    this.clients = new Map();
    this.heartbeatId = null;
  }

  async start() {
    if (this.heartbeatId) return;
    const config = await this.configProvider();
    this.heartbeatId = setInterval(() => {
      this.broadcast({ type: "heartbeat", sentAt: Date.now() });
    }, config.sseHeartbeatMs);
    this.heartbeatId.unref?.();
  }

  addClient(sessionKey, res) {
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.clients.set(clientId, { sessionKey, res });
    this.send(clientId, "connected", { sessionKey, connectedAt: Date.now() });
    return clientId;
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.clients.delete(clientId);
    try {
      client.res.end();
    } catch {
      // ignore socket close errors
    }
  }

  send(clientId, event, payload) {
    const client = this.clients.get(clientId);
    if (!client) return;
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      this.removeClient(clientId);
    }
  }

  broadcast(payload) {
    for (const clientId of this.clients.keys()) this.send(clientId, payload.type, payload);
  }

  async broadcastMessage(message) {
    await appendChatMessage(message);
    this.broadcast({ type: "message", message });
  }
}

function renderPairingApproveHtml(request) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Approve Hermes Agentbox Bridge</title><style>body{font:16px system-ui;background:#111b24;color:#f5f7fa;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:520px;padding:24px;border:1px solid #334;border-radius:18px;background:#172532}button{width:100%;min-height:48px;border:0;border-radius:12px;background:#ffd36a;font-weight:700}</style></head><body><main class="card"><h1>Approve local Hermes pairing</h1><p>Origin: ${String(request.origin).replaceAll("<", "&lt;")}</p><button id="approve">Approve this browser</button><p id="status"></p></main><script>const pairingId=${JSON.stringify(request.pairingId)};const approveSecret=${JSON.stringify(request.approveSecret)};document.getElementById("approve").onclick=async()=>{const s=document.getElementById("status");s.textContent="Approving…";const r=await fetch("${DEFAULT_BRIDGE_PATH_PREFIX}/pair/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pairingId,approveSecret})});s.textContent=r.ok?"Approved. You can close this window.":"Approval failed.";if(r.ok) window.close();};</script></body></html>`;
}

async function ensureLocalSignerForBridge(runtime) {
  try {
    const existing = runtime?.signers?.loadRecord?.();
    if (existing) return;
    const result = await runtime.invoke("agentbox.signer.prepare", {
      label: "local-gameplay-signer",
    });
    if (result?.ok) {
      const signer = result?.data?.data || result?.details?.data || result?.data || {};
      console.log(`Agentbox Hermes bridge created local gameplay signer${signer.address ? ` ${signer.address}` : ""}`);
      return;
    }
    console.warn(`Agentbox Hermes bridge failed to create local gameplay signer: ${JSON.stringify(result)}`);
  } catch (error) {
    console.warn(
      `Agentbox Hermes bridge failed to ensure local gameplay signer: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function main() {
  const config = await ensureConfig();
  const runtime = new JSPlayerRuntime(PLUGIN_ROOT, {
    settings: {
      dataDir: HERMES_AGENTBOX_HOME,
    },
  });
  await ensureLocalSignerForBridge(runtime);
  const configProvider = async () => loadConfig();
  const pairingManager = new PairingManager(configProvider);
  const ticketManager = new StreamTicketManager();
  const hub = new SseHub(configProvider);
  await hub.start();

  const server = http.createServer(async (req, res) => {
    const latestConfig = await loadConfig();
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const url = new URL(req.url ?? "/", `http://${latestConfig.host}:${latestConfig.port}`);
    const route = url.pathname.startsWith(DEFAULT_BRIDGE_PATH_PREFIX)
      ? url.pathname.slice(DEFAULT_BRIDGE_PATH_PREFIX.length) || "/"
      : "";

    try {
      if (!route) {
        writeJson(res, 404, { ok: false, error: "route_not_found" }, origin, latestConfig);
        return;
      }
      if (!isOriginAllowed(origin, latestConfig) && route !== "/pair/approve-page" && route !== "/pair/approve") {
        writeJson(res, 403, { ok: false, error: "origin_not_allowed" }, origin, latestConfig);
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, createCorsHeaders(origin, latestConfig));
        res.end();
        return;
      }
      if (route === "/status") {
        writeJson(
          res,
          200,
          {
            ok: true,
            available: true,
            bridgeEnabled: latestConfig.enabled,
            requiresToken: true,
            hasToken: Boolean(latestConfig.token),
            defaultSessionKey: latestConfig.defaultSessionKey,
            sseHeartbeatMs: latestConfig.sseHeartbeatMs,
            provider: "hermes",
          },
          origin,
          latestConfig
        );
        return;
      }
      if (!latestConfig.enabled) {
        writeJson(res, 503, { ok: false, error: "bridge_disabled" }, origin, latestConfig);
        return;
      }
      if (route === "/pair/start") {
        const request = await pairingManager.start(origin);
        writeJson(
          res,
          200,
          {
            ok: true,
            pairingId: request.pairingId,
            expiresAt: request.expiresAt,
            approveUrl: `${DEFAULT_BRIDGE_PATH_PREFIX}/pair/approve-page?pairingId=${encodeURIComponent(request.pairingId)}`,
          },
          origin,
          latestConfig
        );
        return;
      }
      if (route === "/pair/approve-page") {
        const request = pairingManager.get(url.searchParams.get("pairingId") || "");
        writeHtml(res, request ? 200 : 404, request ? renderPairingApproveHtml(request) : "Pairing request not found.", origin, latestConfig);
        return;
      }
      if (route === "/pair/approve") {
        const body = await readJsonBody(req);
        const result = pairingManager.approve(String(body.pairingId || ""), String(body.approveSecret || ""));
        writeJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, pairingId: body.pairingId, approvedAt: result.request.approvedAt } : result, origin, latestConfig);
        return;
      }
      if (route === "/pair/complete") {
        const body = await readJsonBody(req);
        const result = pairingManager.complete(String(body.pairingId || ""));
        writeJson(res, result.ok ? 200 : 404, result, origin, latestConfig);
        return;
      }
      if (route !== "/stream" && getBearerToken(req) !== latestConfig.token) {
        writeJson(res, 401, { ok: false, error: "invalid_bridge_token" }, origin, latestConfig);
        return;
      }
      if (route === "/auth/verify") {
        writeJson(res, 200, { ok: true, sessionKey: latestConfig.defaultSessionKey, bridgeEnabled: latestConfig.enabled }, origin, latestConfig);
        return;
      }
      if (route === "/config/rpc") {
        if (req.method === "GET") {
          writeJson(res, 200, runtime.getRpcConfig(), origin, latestConfig);
          return;
        }
        if (req.method !== "POST") {
          writeText(res, 405, "Method Not Allowed", origin, latestConfig);
          return;
        }
        const body = await readJsonBody(req);
        try {
          writeJson(res, 200, runtime.updateRpcConfig(body.rpcUrl), origin, latestConfig);
        } catch (error) {
          writeJson(
            res,
            400,
            {
              ok: false,
              error: error?.errorCode || "invalid_rpc_url",
              message: error instanceof Error ? error.message : String(error),
            },
            origin,
            latestConfig
          );
        }
        return;
      }
      if (route === "/session/ensure") {
        writeJson(res, 200, { ok: true, sessionKey: latestConfig.defaultSessionKey, exists: true }, origin, latestConfig);
        return;
      }
      if (route === "/history") {
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "50") || 50));
        writeJson(res, 200, { ok: true, sessionKey: latestConfig.defaultSessionKey, messages: await loadChatHistory(limit) }, origin, latestConfig);
        return;
      }
      if (route === "/game/active-role") {
        const activeRole = runtime?.activeRoles?.loadRecord?.() || null;
        writeJson(
          res,
          200,
          {
            ok: true,
            hasActiveRole: Boolean(activeRole?.roleWallet),
            isOwnedByActiveSigner: Boolean(activeRole?.roleWallet),
            warning: null,
            activeRole: activeRole?.roleWallet
              ? {
                  roleId: activeRole.roleId ?? null,
                  roleWallet: activeRole.roleWallet,
                  ownerAddress: activeRole.ownerAddress ?? "",
                  x: null,
                  y: null,
                  state: null,
                  stateName: "",
                  nickname: "",
                }
              : null,
          },
          origin,
          latestConfig
        );
        return;
      }
      if (route === "/account/status") {
        writeJson(res, 200, formatBridgeLocalAccountStatus(runtime), origin, latestConfig);
        return;
      }
      if (route === "/account/signer/prepare") {
        const body = await readJsonBody(req);
        const result = await runtime.invoke("agentbox.signer.prepare", {
          label: typeof body.label === "string" ? body.label.trim() : undefined,
          force: Boolean(body.force),
          backupConfirmed: Boolean(body.backupConfirmed),
          confirmSignerReplacement: Boolean(body.confirmSignerReplacement),
        });
        writeRuntimeResult(res, origin, latestConfig, result, formatBridgeSigner);
        return;
      }
      if (route === "/account/signer/import") {
        const body = await readJsonBody(req);
        const result = await runtime.invoke("agentbox.signer.import", {
          privateKey: typeof body.privateKey === "string" ? body.privateKey.trim() : "",
          label: typeof body.label === "string" ? body.label.trim() : undefined,
          force: Boolean(body.force),
          backupConfirmed: Boolean(body.backupConfirmed),
          confirmSignerReplacement: Boolean(body.confirmSignerReplacement),
        });
        writeRuntimeResult(res, origin, latestConfig, result, formatBridgeSigner);
        return;
      }
      if (route === "/account/signer/export") {
        const result = latestConfig.allowPrivateKeyExport
          ? await runtime.invoke("agentbox.signer.export", {})
          : { ok: false, errorCode: "PRIVATE_KEY_EXPORT_DISABLED", errorMessage: "Private key export is disabled" };
        writeRuntimeResult(res, origin, latestConfig, result, (runtimeResult) => formatBridgeSigner(runtimeResult, { includePrivateKey: true }));
        return;
      }
      if (route === "/account/registration/confirm") {
        const body = await readJsonBody(req);
        const result = await runtime.invoke("agentbox.registration.confirm", {
          profileMode: typeof body.profileMode === "string" ? body.profileMode : "manual",
          nickname: typeof body.nickname === "string" ? body.nickname.trim() : undefined,
          gender: body.gender == null || body.gender === "" ? undefined : Number(body.gender),
        });
        writeRuntimeResult(res, origin, latestConfig, result, formatBridgeRegistration);
        return;
      }
      if (route === "/account/roles") {
        writeJson(res, 200, formatBridgeLocalRoles(runtime), origin, latestConfig);
        return;
      }
      if (route === "/account/roles/active") {
        writeRuntimeResult(res, origin, latestConfig, await runtime.invoke("agentbox.roles.read_active", {}), formatBridgeActiveRole);
        return;
      }
      if (route === "/account/roles/select") {
        const body = await readJsonBody(req);
        writeRuntimeResult(res, origin, latestConfig, await runtime.invoke("agentbox.roles.select_active", {
          roleWallet: typeof body.roleWallet === "string" ? body.roleWallet.trim() : undefined,
          roleId: body.roleId == null || body.roleId === "" ? undefined : Number(body.roleId),
        }));
        return;
      }
      if (route === "/account/roles/clear") {
        writeRuntimeResult(res, origin, latestConfig, await runtime.invoke("agentbox.roles.clear_active", {}));
        return;
      }
      if (route === "/operations/state") {
        writeRuntimeResult(res, origin, latestConfig, await runtime.invoke("agentbox.operations.read_state", {}), formatBridgeOperationState);
        return;
      }
      if (route === "/background/status") {
        writeJson(res, 200, formatBackgroundJobStatus(await findBackgroundJob(), await readCustomStrategy(runtime)), origin, latestConfig);
        return;
      }
      if (route === "/background/start" || route === "/background/update-goal") {
        const body = await readJsonBody(req);
        if (route === "/background/update-goal") {
          if (typeof body.customStrategy === "string") {
            await runtime.invoke("agentbox.operations.update_strategy", { customStrategy: body.customStrategy });
          }
          const existing = await findBackgroundJob();
          if (!existing) {
            writeJson(res, 200, formatBackgroundJobStatus(null, await readCustomStrategy(runtime)), origin, latestConfig);
            return;
          }
        }
        const job = await createOrUpdateBackgroundJob(runtime, body);
        if (route === "/background/start" && job?.id) {
          const runResult = await spawnCommand(HERMES_CLI, ["cron", "run", job.id]);
          if (!runResult.ok) throw new Error(runResult.stderr || runResult.stdout || "Hermes cron run failed");
        }
        writeJson(res, 200, formatBackgroundJobStatus(await findBackgroundJob(), await readCustomStrategy(runtime)), origin, latestConfig);
        return;
      }
      if (route === "/background/stop") {
        const job = await findBackgroundJob();
        if (!job?.id) {
          writeJson(res, 404, { ok: false, error: "background_job_missing" }, origin, latestConfig);
          return;
        }
        const pauseResult = await spawnCommand(HERMES_CLI, ["cron", "pause", job.id]);
        if (!pauseResult.ok) throw new Error(pauseResult.stderr || pauseResult.stdout || "Hermes cron pause failed");
        writeJson(res, 200, formatBackgroundJobStatus(await findBackgroundJob(), await readCustomStrategy(runtime)), origin, latestConfig);
        return;
      }
      if (route === "/send") {
        const body = await readJsonBody(req);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) {
          writeJson(res, 400, { ok: false, error: "message_required" }, origin, latestConfig);
          return;
        }
        const userMessage = {
          id: `user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
          sessionKey: latestConfig.defaultSessionKey,
          role: "user",
          text,
          createdAt: Date.now(),
          kind: "user",
        };
        await hub.broadcastMessage(userMessage);
        void (async () => {
          const result = await spawnCommand(HERMES_CLI, [
            "chat",
            "--continue",
            latestConfig.defaultSessionKey,
            "--query",
            text,
            "--quiet",
            "--source",
            "agentbox-game",
            "--skills",
            "agentbox-hermes-skills",
          ]);
          const assistantText = normalizeHermesChatOutput(result.stdout) || result.stderr.trim() || "Hermes did not return a response.";
          await hub.broadcastMessage({
            id: `assistant-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            sessionKey: latestConfig.defaultSessionKey,
            role: result.ok ? "assistant" : "system",
            text: assistantText,
            createdAt: Date.now(),
            kind: result.ok ? "assistant" : "system",
          });
        })();
        writeJson(res, 200, { ok: true, runId: userMessage.id, sessionKey: latestConfig.defaultSessionKey }, origin, latestConfig);
        return;
      }
      if (route === "/stream-ticket") {
        const ticket = ticketManager.create(latestConfig.defaultSessionKey);
        writeJson(res, 200, { ok: true, sessionKey: latestConfig.defaultSessionKey, ...ticket }, origin, latestConfig);
        return;
      }
      if (route === "/stream") {
        const ticket = ticketManager.consume(url.searchParams.get("ticket") || "");
        if (!ticket) {
          writeJson(res, 401, { ok: false, error: "invalid_stream_ticket" }, origin, latestConfig);
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          ...createCorsHeaders(origin, latestConfig),
        });
        const clientId = hub.addClient(ticket.sessionKey, res);
        req.on("close", () => hub.removeClient(clientId));
        return;
      }
      writeJson(res, 404, { ok: false, error: "route_not_found" }, origin, latestConfig);
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin, latestConfig);
    }
  });

  const shutdown = async () => {
    await cleanupRuntimeFiles();
  };
  process.once("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
  process.once("exit", () => {
    try {
      fs.rmSync(BRIDGE_PID_PATH, { force: true });
      fs.rmSync(BRIDGE_RUNTIME_PATH, { force: true });
    } catch {
      // ignore process-exit cleanup errors
    }
  });

  server.listen(config.port, config.host, async () => {
    await writeRuntimeFiles(config);
    console.log(`Agentbox Hermes bridge listening on http://${config.host}:${config.port}${DEFAULT_BRIDGE_PATH_PREFIX}`);
    console.log(`Bridge token: ${config.token}`);
  });
}

await main();
