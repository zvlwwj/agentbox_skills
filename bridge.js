import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BRIDGE_TOKEN_BYTES = 24;
const DEFAULT_BRIDGE_SESSION_KEY = "session:agentbox-game-chat";
const DEFAULT_SSE_HEARTBEAT_MS = 15000;
const DEFAULT_PAIRING_TTL_MS = 2 * 60 * 1000;
const AGENTBOX_BACKGROUND_JOB_NAME = "agentbox-background-runner";
const AGENTBOX_BACKGROUND_SESSION_TARGET = "session:agentbox-background-runner";
const AGENTBOX_BACKGROUND_EVERY = "30m";
const AGENTBOX_BACKGROUND_EVERY_MS = 30 * 60 * 1000;
const MIN_BACKGROUND_INTERVAL_MINUTES = 1;
const MAX_BACKGROUND_INTERVAL_MINUTES = 24 * 60;
const CRON_RPC_TIMEOUT_MS = 8000;
const BACKGROUND_METADATA_PREFIX = "AGENTBOX_BACKGROUND_CONTROL_JSON:";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:8081",
  "http://localhost:8081",
  "http://127.0.0.1:8090",
  "http://localhost:8090",
  "https://agentbox.world",
  "https://www.agentbox.world",
  "https://play.agentbox.world",
  "https://app.agentbox.world",
];

function randomBridgeToken() {
  return crypto.randomBytes(DEFAULT_BRIDGE_TOKEN_BYTES).toString("hex");
}

function getPluginEntryConfig(cfg, pluginId) {
  return cfg?.plugins?.entries?.[pluginId]?.config ?? {};
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeBridgeConfig(rawConfig) {
  const bridge = rawConfig?.bridge && typeof rawConfig.bridge === "object" ? rawConfig.bridge : {};
  return {
    enabled: bridge.enabled !== false,
    token: typeof bridge.token === "string" ? bridge.token.trim() : "",
    allowedOrigins: normalizeStringArray(bridge.allowedOrigins, DEFAULT_ALLOWED_ORIGINS),
    defaultSessionKey:
      typeof bridge.defaultSessionKey === "string" && bridge.defaultSessionKey.trim()
        ? bridge.defaultSessionKey.trim()
        : DEFAULT_BRIDGE_SESSION_KEY,
    sseHeartbeatMs:
      Number.isFinite(bridge.sseHeartbeatMs) && Number(bridge.sseHeartbeatMs) >= 1000
        ? Number(bridge.sseHeartbeatMs)
        : DEFAULT_SSE_HEARTBEAT_MS,
  };
}

function resolveDefaultAgentId(cfg) {
  const agents = cfg?.agents?.list;
  if (!Array.isArray(agents) || agents.length === 0) return "default";
  const preferred = agents.find((entry) => entry?.default && typeof entry.id === "string" && entry.id.trim());
  if (preferred?.id) return preferred.id.trim();
  const fallback = agents.find((entry) => typeof entry?.id === "string" && entry.id.trim());
  return fallback?.id?.trim() || "default";
}

function readBridgeConfig(api) {
  return normalizeBridgeConfig(getPluginEntryConfig(api.runtime.config.loadConfig(), api.id));
}

function resolveRuntimeSessionKey(api, configuredSessionKey) {
  if (typeof configuredSessionKey === "string" && configuredSessionKey.startsWith("agent:")) {
    return configuredSessionKey;
  }
  const cfg = api.runtime.config.loadConfig();
  const agentId = resolveDefaultAgentId(cfg);
  return `agent:${agentId}:${configuredSessionKey}`;
}

async function writeBridgeConfig(api, update) {
  const cfg = api.runtime.config.loadConfig();
  const plugins = cfg.plugins ?? {};
  const entries = plugins.entries ?? {};
  const currentEntry = entries[api.id] ?? {};
  const currentConfig = currentEntry.config ?? {};
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...currentConfig.bridge,
      ...update,
    },
  };
  const nextCfg = {
    ...cfg,
    plugins: {
      ...plugins,
      entries: {
        ...entries,
        [api.id]: {
          ...currentEntry,
          config: nextConfig,
        },
      },
    },
  };
  await api.runtime.config.writeConfigFile(nextCfg);
  return normalizeBridgeConfig(nextConfig);
}

function createBridgeConfigSchema() {
  return {
    validate(value) {
      const errors = [];
      const bridge = value?.bridge;
      if (bridge != null && typeof bridge !== "object") {
        errors.push("bridge must be an object");
      }
      if (bridge?.enabled != null && typeof bridge.enabled !== "boolean") {
        errors.push("bridge.enabled must be a boolean");
      }
      if (bridge?.token != null && typeof bridge.token !== "string") {
        errors.push("bridge.token must be a string");
      }
      if (bridge?.defaultSessionKey != null && typeof bridge.defaultSessionKey !== "string") {
        errors.push("bridge.defaultSessionKey must be a string");
      }
      if (bridge?.allowedOrigins != null && !Array.isArray(bridge.allowedOrigins)) {
        errors.push("bridge.allowedOrigins must be an array of strings");
      }
      if (Array.isArray(bridge?.allowedOrigins)) {
        for (const origin of bridge.allowedOrigins) {
          if (typeof origin !== "string" || !origin.trim()) {
            errors.push("bridge.allowedOrigins entries must be non-empty strings");
            break;
          }
        }
      }
      if (bridge?.sseHeartbeatMs != null) {
        const valueNumber = Number(bridge.sseHeartbeatMs);
        if (!Number.isFinite(valueNumber) || valueNumber < 1000) {
          errors.push("bridge.sseHeartbeatMs must be a number >= 1000");
        }
      }
      return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
    },
    jsonSchema: {
      type: "object",
      properties: {
        bridge: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: true },
            token: { type: "string" },
            allowedOrigins: {
              type: "array",
              items: { type: "string" },
              default: DEFAULT_ALLOWED_ORIGINS,
            },
            defaultSessionKey: { type: "string", default: DEFAULT_BRIDGE_SESSION_KEY },
            sseHeartbeatMs: { type: "number", default: DEFAULT_SSE_HEARTBEAT_MS },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    },
    uiHints: {
      "bridge.enabled": { widget: "toggle" },
      "bridge.token": { widget: "password" },
      "bridge.allowedOrigins": { widget: "textarea" },
      "bridge.defaultSessionKey": { widget: "text" },
      "bridge.sseHeartbeatMs": { widget: "number" },
    },
  };
}

function parseSessionAgentId(sessionKey) {
  if (typeof sessionKey !== "string") return undefined;
  const parts = sessionKey.split(":");
  if (parts[0] !== "agent" || parts.length < 2) return undefined;
  return parts[1]?.trim() || undefined;
}

function readSessionStore(api, sessionKey) {
  const cfg = api.runtime.config.loadConfig();
  const storePath = api.runtime.agent.session.resolveStorePath(cfg.session?.store, {
    agentId: parseSessionAgentId(sessionKey),
  });
  const store = api.runtime.agent.session.loadSessionStore(storePath);
  return {
    store,
    storePath,
    entry: store?.[sessionKey] ?? null,
  };
}

function extractTextParts(content) {
  if (typeof content === "string") {
    return content.trim() ? [content.trim()] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push(block.text.trim());
    }
    if (block.type === "output_text" && typeof block.text === "string" && block.text.trim()) {
      parts.push(block.text.trim());
    }
  }
  return parts;
}

function normalizeMessageRole(rawRole) {
  if (rawRole === "user") return { role: "user", kind: "user" };
  if (rawRole === "assistant") return { role: "assistant", kind: "assistant" };
  if (rawRole === "toolResult") return { role: "system", kind: "tool_summary" };
  return { role: "system", kind: "system" };
}

function resolveCreatedAt(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return Date.now();
}

function normalizeChatMessage(sessionKey, rawMessage, fallbackId) {
  if (!rawMessage || typeof rawMessage !== "object") return null;
  const envelope = rawMessage;
  const message = envelope.message && typeof envelope.message === "object" ? envelope.message : envelope;
  const rawRole = typeof message.role === "string" ? message.role : typeof envelope.role === "string" ? envelope.role : "system";
  if (rawRole === "toolCall") return null;
  const { role, kind } = normalizeMessageRole(rawRole);
  const textParts = extractTextParts(message.content);
  let text = textParts.join("\n").trim();
  if (!text && rawRole === "toolResult" && typeof message.toolName === "string" && message.toolName.trim()) {
    text = `Tool result: ${message.toolName.trim()}`;
  }
  if (!text && rawRole !== "system") return null;
  const createdAt = resolveCreatedAt(envelope.timestamp, envelope.createdAt, message.timestamp);
  const id =
    (typeof envelope.messageId === "string" && envelope.messageId) ||
    (typeof envelope.id === "string" && envelope.id) ||
    fallbackId;
  return {
    id,
    sessionKey,
    role,
    text,
    createdAt,
    kind,
  };
}

function normalizeHistory(sessionKey, messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message, index) => normalizeChatMessage(sessionKey, message, `message-${index}`))
    .filter(Boolean);
}

async function loadNormalizedSessionMessages(api, sessionKey, limit = 50) {
  const { entry } = readSessionStore(api, sessionKey);
  if (!entry?.sessionFile) return [];
  let rawTranscript = "";
  try {
    rawTranscript = await fs.readFile(entry.sessionFile, "utf8");
  } catch {
    return [];
  }
  const parsed = rawTranscript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const messages = parsed
    .filter((record) => record?.type === "message")
    .map((record, index) => normalizeChatMessage(sessionKey, record, record?.id ?? `message-${index}`))
    .filter(Boolean);
  return messages.slice(-limit);
}

function createCorsHeaders(origin) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "false",
    Vary: "Origin",
  };
}

function writeJson(res, statusCode, payload, origin) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...createCorsHeaders(origin),
  });
  res.end(body);
}

function writeText(res, statusCode, text, origin) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...createCorsHeaders(origin),
  });
  res.end(text);
}

function writeHtml(res, statusCode, html, origin, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    ...createCorsHeaders(origin),
    ...extraHeaders,
  });
  res.end(html);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
  const queryToken = url.searchParams.get("token");
  return queryToken?.trim() || "";
}

function formatBridgeWarning(warning, fallback = null) {
  if (typeof warning === "string") return warning;
  if (warning?.errorMessage) return warning.errorMessage;
  if (warning?.errorCode) return warning.errorCode;
  return fallback;
}

function formatBridgeActiveRole(runtimeResult) {
  const data = runtimeResult?.data && typeof runtimeResult.data === "object" ? runtimeResult.data : {};
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

function runtimeData(result) {
  return result?.data && typeof result.data === "object" ? result.data : {};
}

function writeRuntimeResult(res, origin, result, formatter = null) {
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
      origin
    );
    return;
  }
  writeJson(res, 200, formatter ? formatter(result) : { ok: true, ...runtimeData(result) }, origin);
}

function formatBridgeAccountStatus(signerResult, activeRoleResult) {
  const signerData = runtimeData(signerResult);
  const activeData = runtimeData(activeRoleResult);
  const signer = signerData.signer && typeof signerData.signer === "object" ? signerData.signer : null;
  return {
    ok: true,
    signer: {
      exists: Boolean(signerData.hasSigner && signer),
      signerId: signer?.signerId ?? null,
      ownerAddress: signer?.address ?? null,
      label: signer?.label ?? null,
      balanceEth: signer?.balanceEth ?? null,
    },
    activeRole: activeData.activeRole ?? signerData.activeRole ?? null,
    hasActiveRole: Boolean(activeData.hasActiveRole ?? signerData.hasActiveRole),
    activeRoleOwnedBySigner: Boolean(activeData.isOwnedByActiveSigner ?? signerData.activeRoleOwnedBySigner),
    ownedRolesCount: Number(signerData.ownedRolesCount ?? activeData.ownedRolesCount ?? 0),
    registrationFeeEth: signerData.registrationFeeEth ?? null,
    warning: formatBridgeWarning(activeData.warning),
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
      balanceEth: signer?.balanceEth ?? null,
      hasPrivateKey: Boolean(signer?.hasPrivateKey || signer?.privateKey),
      ...(includePrivateKey && signer?.privateKey ? { privateKey: signer.privateKey } : {}),
    },
    ownedRolesCount: Number(data.ownedRolesCount ?? 0),
    activeRole: data.activeRole ?? null,
  };
}

function formatBridgeRoles(result) {
  const data = runtimeData(result);
  const activeRoleWallet = data.activeRole?.roleWallet?.toLowerCase?.() || "";
  const ownedRoles = Array.isArray(data.ownedRoles)
    ? data.ownedRoles.map((role) => ({
        roleId: role.roleId ?? null,
        roleWallet: role.roleWallet ?? "",
        ownerAddress: role.ownerAddress ?? data.ownerAddress ?? "",
        isActive: Boolean(role.isActive || (activeRoleWallet && role.roleWallet?.toLowerCase?.() === activeRoleWallet)),
      }))
    : [];
  return {
    ok: true,
    ownerAddress: data.ownerAddress ?? null,
    activeRole: data.activeRole ?? null,
    ownedRolesCount: Number(data.ownedRolesCount ?? ownedRoles.length),
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
    updatedAt: state.updatedAt ?? null,
  };
}

function sanitizeBackgroundText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 4000);
}

function normalizeBackgroundIntervalMinutes(value, fallback = 30) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_BACKGROUND_INTERVAL_MINUTES, Math.max(MIN_BACKGROUND_INTERVAL_MINUTES, Math.round(numeric)));
}

function normalizeBackgroundLanguage(value, ...textHints) {
  if (value === "zh" || value === "en") return value;
  const joined = textHints.filter((item) => typeof item === "string").join("\n");
  return /[\u3400-\u9fff]/.test(joined) ? "zh" : "en";
}

function backgroundTemplateUrl(language) {
  return new URL(language === "zh" ? "./docs/OPENCLAW_CRON_PROMPT_CN.md" : "./docs/OPENCLAW_CRON_PROMPT.md", import.meta.url);
}

function backgroundMetadataFromMessage(message) {
  if (typeof message !== "string") return {};
  const index = message.lastIndexOf(BACKGROUND_METADATA_PREFIX);
  if (index < 0) return {};
  const raw = message.slice(index + BACKGROUND_METADATA_PREFIX.length).trim().split("\n")[0]?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readActiveRoleForBackground(runtime) {
  if (!runtime?.invoke) {
    return { activeRole: null, ownerAddress: "", signerAddress: "" };
  }
  const signerResult = await runtime.invoke("agentbox.signer.read", {});
  const signerData = runtimeData(signerResult);
  const activeResult = signerData.hasSigner ? await runtime.invoke("agentbox.roles.read_active", {}) : null;
  const activeData = runtimeData(activeResult);
  return {
    activeRole: activeData.activeRole || signerData.activeRole || null,
    ownerAddress: activeData.ownerAddress || signerData.signer?.address || "",
    signerAddress: signerData.signer?.address || "",
  };
}

async function buildBackgroundPrompt({ runtime, goal, customStrategy, language }) {
  const normalizedGoal = sanitizeBackgroundText(goal, "");
  const normalizedStrategy = sanitizeBackgroundText(customStrategy, "");
  const resolvedLanguage = normalizeBackgroundLanguage(language, normalizedGoal, normalizedStrategy);
  const template = await fs.readFile(backgroundTemplateUrl(resolvedLanguage), "utf8");
  const { activeRole, ownerAddress } = await readActiveRoleForBackground(runtime);
  const roleWallet = activeRole?.roleWallet || "<rolewallet_address>";
  const owner = activeRole?.ownerAddress || ownerAddress || "<owner_address>";
  const currentTime = new Date().toISOString();
  const contextBlock =
    resolvedLanguage === "zh"
      ? [
          "## 用户目标 / 自定义策略",
          "",
          `- 当前游戏目标：${normalizedGoal || "未指定，按默认收益与成长策略推进"}`,
          `- 自定义策略：${normalizedStrategy || "无"}`,
          "- 该部分由 Agentbox 前端 Background Agent 面板写入；不要删除上方固定结构。",
        ].join("\n")
      : [
          "## User Goal / Custom Strategy",
          "",
          `- Current gameplay goal: ${normalizedGoal || "Not specified; continue with the default growth and profit strategy"}`,
          `- Custom strategy: ${normalizedStrategy || "None"}`,
          "- This section is written by the Agentbox frontend Background Agent panel; do not remove the fixed structure above.",
        ].join("\n");
  const metadata = {
    goal: normalizedGoal,
    customStrategy: normalizedStrategy,
    language: resolvedLanguage,
    roleWallet,
    owner,
    updatedAt: currentTime,
  };
  const hydrated = template
    .replaceAll("<rolewallet_address>", roleWallet)
    .replaceAll("<owner_address>", owner)
    .replaceAll("{{CURRENT_TIME}}", currentTime);
  return `${hydrated.trim()}\n\n${contextBlock}\n\n${BACKGROUND_METADATA_PREFIX} ${JSON.stringify(metadata)}`;
}

function resolveCronService(api) {
  const candidates = [
    api?.context?.cron,
    api?.deps?.cron,
    api?.runtime?.cron,
    api?.runtime?.context?.cron,
    api?.runtime?.deps?.cron,
  ];
  return candidates.find(
    (candidate) =>
      candidate &&
      typeof candidate.list === "function" &&
      typeof candidate.add === "function" &&
      typeof candidate.update === "function"
  );
}

let gatewayCronCallerPromise = null;

async function loadGatewayCronCaller() {
  if (!gatewayCronCallerPromise) {
    gatewayCronCallerPromise = (async () => {
      try {
        const mod = await import("openclaw/plugin-sdk/agent-harness");
        if (typeof mod.callGatewayTool === "function") return mod.callGatewayTool;
      } catch {
        // External plugins may live outside OpenClaw's package tree, so bare resolution can fail.
      }
      const candidates = [];
      const openclawEntrypoint = process.argv.find(
        (arg) => typeof arg === "string" && path.basename(arg) === "openclaw.mjs"
      );
      if (openclawEntrypoint) {
        candidates.push(path.join(path.dirname(openclawEntrypoint), "dist/plugin-sdk/agent-harness.js"));
      }
      candidates.push(path.resolve(path.dirname(process.execPath), "../lib/node_modules/openclaw/dist/plugin-sdk/agent-harness.js"));
      for (const candidate of candidates) {
        try {
          const mod = await import(pathToFileURL(candidate).href);
          if (typeof mod.callGatewayTool === "function") return mod.callGatewayTool;
        } catch {
          // Try the next known install shape.
        }
      }
      throw new Error("openclaw_gateway_caller_unavailable");
    })();
  }
  return gatewayCronCallerPromise;
}

async function callCronRpc(method, params, { timeoutMs = CRON_RPC_TIMEOUT_MS } = {}) {
  const callGatewayTool = await loadGatewayCronCaller();
  return callGatewayTool(method, { timeoutMs }, params);
}

async function listCronJobs(api) {
  const cron = resolveCronService(api);
  if (cron) {
    try {
      const listed = await cron.list({ includeDisabled: true });
      if (Array.isArray(listed)) return listed;
      if (Array.isArray(listed?.jobs)) return listed.jobs;
    } catch (error) {
      api?.logger?.warn?.(
        `agentbox bridge: cron service list failed, falling back to gateway RPC: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  try {
    const listed = await callCronRpc("cron.list", { includeDisabled: true, limit: 200 });
    if (Array.isArray(listed)) return listed;
    if (Array.isArray(listed?.jobs)) return listed.jobs;
  } catch (error) {
    api?.logger?.warn?.(
      `agentbox bridge: gateway cron list failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

function findBackgroundJob(jobs) {
  return (Array.isArray(jobs) ? jobs : []).find(
    (job) => job?.name === AGENTBOX_BACKGROUND_JOB_NAME || job?.sessionTarget === AGENTBOX_BACKGROUND_SESSION_TARGET
  );
}

function backgroundScheduleLabel(job) {
  if (!job?.schedule) return null;
  if (job.schedule.kind === "every") {
    const ms = Number(job.schedule.everyMs || 0);
    if (ms === AGENTBOX_BACKGROUND_EVERY_MS) return AGENTBOX_BACKGROUND_EVERY;
    if (ms > 0) return `${Math.round(ms / 60000)}m`;
  }
  if (job.schedule.kind === "cron") return job.schedule.expr || "cron";
  if (job.schedule.kind === "once") return job.schedule.atMs ? new Date(job.schedule.atMs).toISOString() : "once";
  return job.schedule.kind || null;
}

function backgroundIntervalMinutes(job) {
  if (job?.schedule?.kind !== "every") return null;
  const ms = Number(job.schedule.everyMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}

function formatBackgroundJobStatus(job) {
  if (!job) {
    return {
      ok: true,
      exists: false,
      enabled: false,
      jobId: null,
      name: AGENTBOX_BACKGROUND_JOB_NAME,
      schedule: null,
      intervalMinutes: null,
      sessionKey: AGENTBOX_BACKGROUND_SESSION_TARGET,
      goal: null,
      customStrategy: null,
      lastRunAt: null,
      lastRunStatus: null,
    };
  }
  const metadata = backgroundMetadataFromMessage(job.payload?.message);
  return {
    ok: true,
    exists: true,
    enabled: job.enabled !== false,
    jobId: job.id || null,
    name: job.name || AGENTBOX_BACKGROUND_JOB_NAME,
    schedule: backgroundScheduleLabel(job),
    intervalMinutes: backgroundIntervalMinutes(job),
    sessionKey: job.sessionTarget || AGENTBOX_BACKGROUND_SESSION_TARGET,
    goal: typeof metadata.goal === "string" ? metadata.goal : null,
    customStrategy: typeof metadata.customStrategy === "string" ? metadata.customStrategy : null,
    language: metadata.language === "zh" || metadata.language === "en" ? metadata.language : null,
    lastRunAt: Number.isFinite(job.state?.lastRunAtMs) ? job.state.lastRunAtMs : null,
    lastRunStatus: job.state?.lastRunStatus || job.state?.lastStatus || null,
    runningAt: Number.isFinite(job.state?.runningAtMs) ? job.state.runningAtMs : null,
  };
}

function desiredBackgroundJob({ api, message, enabled = true, intervalMinutes = 30 }) {
  const normalizedIntervalMinutes = normalizeBackgroundIntervalMinutes(intervalMinutes);
  return {
    agentId: resolveDefaultAgentId(api.runtime.config.loadConfig()),
    name: AGENTBOX_BACKGROUND_JOB_NAME,
    description: "Agentbox stable background gameplay runner managed by the Agentbox local bridge",
    enabled,
    deleteAfterRun: false,
    schedule: {
      kind: "every",
      everyMs: normalizedIntervalMinutes * 60 * 1000,
      anchorMs: Date.now(),
    },
    sessionTarget: AGENTBOX_BACKGROUND_SESSION_TARGET,
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message,
      lightContext: true,
    },
    delivery: {
      mode: "none",
    },
  };
}

async function createOrUpdateBackgroundJob(api, message, { enabled = true, intervalMinutes = 30 } = {}) {
  const cron = resolveCronService(api);
  const existing = findBackgroundJob(await listCronJobs(api));
  const desired = desiredBackgroundJob({ api, message, enabled, intervalMinutes });
  if (cron) {
    if (existing?.id) {
      await cron.update(existing.id, desired);
      return findBackgroundJob(await listCronJobs(api));
    }
    await cron.add(desired);
    return findBackgroundJob(await listCronJobs(api));
  }
  if (existing?.id) {
    await callCronRpc("cron.update", {
      id: existing.id,
      patch: desired,
    });
    return findBackgroundJob(await listCronJobs(api));
  }
  await callCronRpc("cron.add", desired);
  return findBackgroundJob(await listCronJobs(api));
}

async function setBackgroundJobEnabled(api, jobId, enabled) {
  const cron = resolveCronService(api);
  if (cron) {
    try {
      await cron.update(jobId, { enabled });
      const job = findBackgroundJob(await listCronJobs(api));
      if (job) return job;
    } catch (error) {
      api?.logger?.warn?.(
        `agentbox bridge: cron service update failed, falling back to gateway RPC: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  await callCronRpc("cron.update", {
    id: jobId,
    patch: { enabled },
  });
  return findBackgroundJob(await listCronJobs(api));
}

async function runBackgroundJobNow(api, jobId) {
  return await callCronRpc("cron.run", {
    jobId,
    mode: "force",
  });
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

class OpenClawBridgeHub {
  constructor(api) {
    this.api = api;
    this.clients = new Map();
    this.unsubscribe = null;
    this.heartbeatId = null;
    this.pollId = null;
    this.recentFingerprints = [];
    this.seenMessageIds = new Set();
  }

  start() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.api.runtime.events.onSessionTranscriptUpdate((update) => {
      const bridgeConfig = readBridgeConfig(this.api);
      const runtimeSessionKey = resolveRuntimeSessionKey(this.api, bridgeConfig.defaultSessionKey);
      if (update?.sessionKey !== runtimeSessionKey) return;
      const normalized = normalizeChatMessage(
        runtimeSessionKey,
        update?.message,
        update?.messageId ?? `message-${Date.now()}`
      );
      if (!normalized) return;
      this.broadcastMessage(normalized);
    });
    this.resetHeartbeat();
    this.startPolling();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    if (this.pollId) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }

  resetHeartbeat() {
    if (this.heartbeatId) clearInterval(this.heartbeatId);
    const heartbeatMs = readBridgeConfig(this.api).sseHeartbeatMs;
    this.heartbeatId = setInterval(() => {
      this.broadcast({ type: "heartbeat", sentAt: Date.now() });
    }, heartbeatMs);
    this.heartbeatId.unref?.();
  }

  startPolling() {
    if (this.pollId) clearInterval(this.pollId);
    const tick = async () => {
      if (this.clients.size === 0) return;
      const sessionKeys = [...new Set([...this.clients.values()].map((client) => client.sessionKey))];
      for (const sessionKey of sessionKeys) {
        const messages = await loadNormalizedSessionMessages(this.api, sessionKey, 20);
        for (const message of messages) {
          if (this.seenMessageIds.has(message.id)) continue;
          this.seenMessageIds.add(message.id);
          this.broadcastMessage(message);
        }
      }
    };
    this.pollId = setInterval(() => {
      tick().catch(() => {
        // ignore bridge polling errors and try again next cycle
      });
    }, 1000);
    this.pollId.unref?.();
  }

  addClient(sessionKey, res) {
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.clients.set(clientId, { sessionKey, res });
    this.send(clientId, "connected", {
      sessionKey,
      connectedAt: Date.now(),
    });
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
    for (const clientId of this.clients.keys()) {
      this.send(clientId, payload.type, payload);
    }
  }

  broadcastMessage(message) {
    const fingerprint = `${message.sessionKey}|${message.role}|${message.kind}|${message.text}|${message.createdAt}`;
    if (this.recentFingerprints.includes(fingerprint)) return;
    this.seenMessageIds.add(message.id);
    this.recentFingerprints.push(fingerprint);
    if (this.recentFingerprints.length > 200) {
      this.recentFingerprints.splice(0, this.recentFingerprints.length - 200);
    }
    this.broadcast({
      type: "message",
      message,
    });
  }
}

class OpenClawBridgePairingManager {
  constructor(api) {
    this.api = api;
    this.requests = new Map();
  }

  cleanup() {
    const now = Date.now();
    for (const [pairingId, request] of this.requests.entries()) {
      if (request.expiresAt <= now || request.status === "consumed") {
        this.requests.delete(pairingId);
      }
    }
  }

  async start(origin) {
    this.cleanup();
    const bridgeConfig = readBridgeConfig(this.api);
    const token = bridgeConfig.token || (await writeBridgeConfig(this.api, { token: randomBridgeToken() })).token;
    const pairingId = crypto.randomUUID();
    const approveSecret = crypto.randomBytes(18).toString("hex");
    const now = Date.now();
    const request = {
      pairingId,
      token,
      origin: origin || "unknown-origin",
      createdAt: now,
      expiresAt: now + DEFAULT_PAIRING_TTL_MS,
      status: "pending",
      approveSecret,
      approvedAt: 0,
      consumedAt: 0,
    };
    this.requests.set(pairingId, request);
    return request;
  }

  get(pairingId) {
    this.cleanup();
    if (!pairingId) return null;
    const request = this.requests.get(pairingId);
    if (!request) return null;
    if (request.expiresAt <= Date.now()) {
      this.requests.delete(pairingId);
      return null;
    }
    return request;
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
    if (request.status === "pending") {
      return {
        ok: true,
        state: "pending",
        expiresAt: request.expiresAt,
      };
    }
    if (request.status === "approved") {
      request.status = "consumed";
      request.consumedAt = Date.now();
      return {
        ok: true,
        state: "approved",
        token: request.token,
        approvedAt: request.approvedAt,
      };
    }
    return { ok: false, error: "pairing_consumed" };
  }
}

function renderPairingApproveHtml(request) {
  const originLabel = String(request.origin || "unknown-origin")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const pairingId = request.pairingId
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const approveSecret = request.approveSecret
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Approve Agentbox Bridge Pairing</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #1f2d3f, #091118 60%);
        color: #f5f7fa;
        font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .card {
        width: min(520px, calc(100vw - 32px));
        padding: 24px;
        border-radius: 20px;
        background: rgba(7, 15, 24, 0.96);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 30px 80px rgba(0,0,0,0.4);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #8fd9ff;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 26px;
      }
      p {
        margin: 0 0 14px;
        color: rgba(245,247,250,0.84);
      }
      .meta {
        margin: 18px 0;
        padding: 14px;
        border-radius: 14px;
        background: rgba(255,255,255,0.04);
        color: rgba(245,247,250,0.8);
        word-break: break-word;
      }
      button {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffd770, #ffb347);
        color: #17212c;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: wait;
      }
      .status {
        margin-top: 14px;
        min-height: 24px;
        font-size: 14px;
        color: #d9e1ea;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Agentbox Bridge</p>
      <h1>Approve local pairing</h1>
      <p>This will allow the current webpage to connect to your local OpenClaw Agentbox chat session.</p>
      <div class="meta">
        <strong>Requesting origin</strong><br />
        ${originLabel}
      </div>
      <button id="approve" type="button">Approve this browser</button>
      <p id="status" class="status"></p>
    </main>
    <script>
      const pairingId = ${JSON.stringify(pairingId)};
      const approveSecret = ${JSON.stringify(approveSecret)};
      const button = document.getElementById("approve");
      const status = document.getElementById("status");
      button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "Approving…";
        try {
          const response = await fetch("/plugins/agentbox-skills/bridge/pair/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pairingId, approveSecret }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "pairing_failed");
          }
          status.textContent = "Approved. You can close this window.";
          window.close();
        } catch (error) {
          status.textContent = "Approval failed: " + (error?.message || String(error));
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}

function createBridgeHandler(api, hub, pairingManager, routeName, runtime) {
  return async (req, res) => {
    const bridgeConfig = readBridgeConfig(api);
    const runtimeSessionKey = resolveRuntimeSessionKey(api, bridgeConfig.defaultSessionKey);
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const skipOriginGuard = routeName === "pair-approve-page" || routeName === "pair-approve";
    if (!skipOriginGuard && !isOriginAllowed(origin, bridgeConfig.allowedOrigins)) {
      writeJson(res, 403, { ok: false, error: "origin_not_allowed" }, origin);
      return true;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, createCorsHeaders(origin));
      res.end();
      return true;
    }

    if (routeName !== "status" && !bridgeConfig.enabled) {
      writeJson(res, 503, { ok: false, error: "bridge_disabled" }, origin);
      return true;
    }

    if (routeName === "status") {
      writeJson(
        res,
        200,
        {
          ok: true,
          available: true,
          bridgeEnabled: bridgeConfig.enabled,
          requiresToken: true,
          hasToken: Boolean(bridgeConfig.token),
          defaultSessionKey: runtimeSessionKey,
          sseHeartbeatMs: bridgeConfig.sseHeartbeatMs,
        },
        origin
      );
      return true;
    }

    if (routeName === "pair-start") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const request = await pairingManager.start(origin);
      writeJson(
        res,
        200,
        {
          ok: true,
          pairingId: request.pairingId,
          expiresAt: request.expiresAt,
          approveUrl: `/plugins/agentbox-skills/bridge/pair/approve-page?pairingId=${encodeURIComponent(request.pairingId)}`,
        },
        origin
      );
      return true;
    }

    if (routeName === "pair-complete") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const pairingId = typeof body.pairingId === "string" ? body.pairingId.trim() : "";
      const result = pairingManager.complete(pairingId);
      if (!result.ok) {
        writeJson(res, 404, result, origin);
        return true;
      }
      writeJson(res, 200, result, origin);
      return true;
    }

    if (routeName === "pair-approve-page") {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pairingId = url.searchParams.get("pairingId")?.trim() || "";
      const request = pairingManager.get(pairingId);
      if (!request) {
        writeHtml(
          res,
          404,
          "<!doctype html><html><body><p>Pairing request not found or expired.</p></body></html>",
          origin,
          { "X-Frame-Options": "DENY" }
        );
        return true;
      }
      writeHtml(res, 200, renderPairingApproveHtml(request), origin, { "X-Frame-Options": "DENY" });
      return true;
    }

    if (routeName === "pair-approve") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const pairingId = typeof body.pairingId === "string" ? body.pairingId.trim() : "";
      const approveSecret = typeof body.approveSecret === "string" ? body.approveSecret.trim() : "";
      const result = pairingManager.approve(pairingId, approveSecret);
      if (!result.ok) {
        writeJson(res, 400, result, origin);
        return true;
      }
      writeJson(
        res,
        200,
        {
          ok: true,
          pairingId,
          approvedAt: result.request.approvedAt,
        },
        origin
      );
      return true;
    }

    const token = getBearerToken(req);
    if (!bridgeConfig.token || token !== bridgeConfig.token) {
      writeJson(res, 401, { ok: false, error: "invalid_bridge_token" }, origin);
      return true;
    }

    if (routeName === "auth-verify") {
      writeJson(
        res,
        200,
        {
          ok: true,
          sessionKey: runtimeSessionKey,
          bridgeEnabled: bridgeConfig.enabled,
        },
        origin
      );
      return true;
    }

    if (routeName === "session-ensure") {
      const { entry } = readSessionStore(api, runtimeSessionKey);
      writeJson(
        res,
        200,
        {
          ok: true,
          sessionKey: runtimeSessionKey,
          exists: Boolean(entry),
        },
        origin
      );
      return true;
    }

    if (routeName === "history") {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "50") || 50));
      const messages = await loadNormalizedSessionMessages(api, runtimeSessionKey, limit);
      writeJson(
        res,
        200,
        {
          ok: true,
          sessionKey: runtimeSessionKey,
          messages,
        },
        origin
      );
      return true;
    }

    if (routeName === "game-active-role") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      try {
        if (!runtime?.invoke) {
          writeJson(res, 500, { ok: false, error: "agentbox_runtime_unavailable" }, origin);
          return true;
        }
        const result = await runtime.invoke("agentbox.roles.read_active", {});
        const payload = formatBridgeActiveRole(result);
        if (payload.activeRole?.roleWallet) {
          try {
            const snapshot = await runtime.invoke("agentbox.skills.read_role_snapshot", {
              role: payload.activeRole.roleWallet,
              source: "auto",
            });
            const role = snapshot?.data?.dynamicInfo?.role || {};
            const identity = snapshot?.data?.staticInfo?.identity || {};
            payload.activeRole = {
              ...payload.activeRole,
              roleId: payload.activeRole.roleId ?? identity.roleId ?? null,
              x: role.x ?? payload.activeRole.x,
              y: role.y ?? payload.activeRole.y,
              state: role.state ?? payload.activeRole.state,
              stateName: role.stateName ?? payload.activeRole.stateName,
            };
          } catch {
            // Keep the validated active role even if the live snapshot is temporarily unavailable.
          }
        }
        writeJson(res, 200, payload, origin);
      } catch (error) {
        writeJson(
          res,
          500,
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          origin
        );
      }
      return true;
    }

    if (routeName.startsWith("account-") && !runtime?.invoke) {
      writeJson(res, 500, { ok: false, error: "agentbox_runtime_unavailable" }, origin);
      return true;
    }

    if (routeName.startsWith("operations-") && !runtime?.invoke) {
      writeJson(res, 500, { ok: false, error: "agentbox_runtime_unavailable" }, origin);
      return true;
    }

    if (routeName === "account-status") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const signerResult = await runtime.invoke("agentbox.signer.read", {});
      if (!signerResult?.ok) {
        writeRuntimeResult(res, origin, signerResult);
        return true;
      }
      let activeRoleResult = { ok: true, data: { activeRole: null, hasActiveRole: false, ownedRolesCount: 0 } };
      if (runtimeData(signerResult).hasSigner) {
        activeRoleResult = await runtime.invoke("agentbox.roles.read_active", {});
      }
      writeJson(res, 200, formatBridgeAccountStatus(signerResult, activeRoleResult), origin);
      return true;
    }

    if (routeName === "account-signer-prepare") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.signer.prepare", {
        label: typeof body.label === "string" ? body.label.trim() : undefined,
        force: Boolean(body.force),
        backupConfirmed: Boolean(body.backupConfirmed),
        confirmSignerReplacement: Boolean(body.confirmSignerReplacement),
      });
      writeRuntimeResult(res, origin, result, formatBridgeSigner);
      return true;
    }

    if (routeName === "account-signer-import") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.signer.import", {
        privateKey: typeof body.privateKey === "string" ? body.privateKey.trim() : "",
        label: typeof body.label === "string" ? body.label.trim() : undefined,
        force: Boolean(body.force),
        backupConfirmed: Boolean(body.backupConfirmed),
        confirmSignerReplacement: Boolean(body.confirmSignerReplacement),
      });
      writeRuntimeResult(res, origin, result, formatBridgeSigner);
      return true;
    }

    if (routeName === "account-signer-export") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.signer.export", {});
      writeRuntimeResult(res, origin, result, (runtimeResult) => formatBridgeSigner(runtimeResult, { includePrivateKey: true }));
      return true;
    }

    if (routeName === "account-registration-confirm") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.registration.confirm", {
        profileMode: typeof body.profileMode === "string" ? body.profileMode : "manual",
        nickname: typeof body.nickname === "string" ? body.nickname.trim() : undefined,
        gender: body.gender == null || body.gender === "" ? undefined : Number(body.gender),
      });
      writeRuntimeResult(res, origin, result, formatBridgeRegistration);
      return true;
    }

    if (routeName === "account-roles") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.roles.list_owned", {});
      writeRuntimeResult(res, origin, result, formatBridgeRoles);
      return true;
    }

    if (routeName === "account-roles-active") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.roles.read_active", {});
      writeRuntimeResult(res, origin, result, formatBridgeActiveRole);
      return true;
    }

    if (routeName === "account-roles-select") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.roles.select_active", {
        roleWallet: typeof body.roleWallet === "string" ? body.roleWallet.trim() : undefined,
        roleId: body.roleId == null || body.roleId === "" ? undefined : Number(body.roleId),
      });
      writeRuntimeResult(res, origin, result, (runtimeResult) => ({
        ok: true,
        ...runtimeData(runtimeResult),
      }));
      return true;
    }

    if (routeName === "account-roles-clear") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.roles.clear_active", {});
      writeRuntimeResult(res, origin, result);
      return true;
    }

    if (routeName === "operations-state") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      const result = await runtime.invoke("agentbox.operations.read_state", {});
      writeRuntimeResult(res, origin, result, formatBridgeOperationState);
      return true;
    }

    if (routeName === "background-status") {
      if (req.method !== "GET") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      try {
        const job = findBackgroundJob(await listCronJobs(api));
        writeJson(res, 200, formatBackgroundJobStatus(job), origin);
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
      }
      return true;
    }

    if (routeName === "background-start" || routeName === "background-update-goal") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const goal = sanitizeBackgroundText(body.goal, "");
      const customStrategy = sanitizeBackgroundText(body.customStrategy, "");
      const existingJob = findBackgroundJob(await listCronJobs(api));
      const intervalMinutes = normalizeBackgroundIntervalMinutes(
        body.intervalMinutes,
        backgroundIntervalMinutes(existingJob) || 30
      );
      if (routeName === "background-update-goal" && !existingJob) {
        writeJson(res, 404, { ok: false, error: "background_job_missing" }, origin);
        return true;
      }
      try {
        const activeRoleState = await readActiveRoleForBackground(runtime);
        if (!activeRoleState.activeRole?.roleWallet) {
          writeJson(res, 400, { ok: false, error: "missing_active_role" }, origin);
          return true;
        }
        const message = await buildBackgroundPrompt({
          runtime,
          goal,
          customStrategy,
          language: body.language,
        });
        const enabled = routeName === "background-start" ? true : existingJob.enabled !== false;
        const job = await createOrUpdateBackgroundJob(api, message, { enabled, intervalMinutes });
        if (routeName === "background-start") {
          if (!job?.id) {
            writeJson(res, 500, { ok: false, error: "background_job_unavailable" }, origin);
            return true;
          }
          await runBackgroundJobNow(api, job.id);
          writeJson(
            res,
            200,
            formatBackgroundJobStatus({
              ...job,
              enabled: true,
              state: {
                ...(job.state ?? {}),
                runningAtMs: job.state?.runningAtMs ?? Date.now(),
              },
            }),
            origin
          );
          return true;
        }
        writeJson(res, 200, formatBackgroundJobStatus(job), origin);
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
      }
      return true;
    }

    if (routeName === "background-stop") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      try {
        const job = findBackgroundJob(await listCronJobs(api));
        if (!job?.id) {
          writeJson(res, 404, { ok: false, error: "background_job_missing" }, origin);
          return true;
        }
        const nextJob = await setBackgroundJobEnabled(api, job.id, false);
        writeJson(res, 200, formatBackgroundJobStatus(nextJob), origin);
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
      }
      return true;
    }

    if (routeName === "background-run-now") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      try {
        let body = {};
        try {
          body = await readJsonBody(req);
        } catch {
          // Empty body is allowed; run-now can reuse the existing job prompt.
        }
        let job = findBackgroundJob(await listCronJobs(api));
        if (!job?.id) {
          const activeRoleState = await readActiveRoleForBackground(runtime);
          if (!activeRoleState.activeRole?.roleWallet) {
            writeJson(res, 400, { ok: false, error: "missing_active_role" }, origin);
            return true;
          }
          const message = await buildBackgroundPrompt({
            runtime,
            goal: sanitizeBackgroundText(body.goal, ""),
            customStrategy: sanitizeBackgroundText(body.customStrategy, ""),
            language: body.language,
          });
          job = await createOrUpdateBackgroundJob(api, message, {
            enabled: true,
            intervalMinutes: normalizeBackgroundIntervalMinutes(body.intervalMinutes, 30),
          });
        } else if (job.enabled === false) {
          job = await setBackgroundJobEnabled(api, job.id, true);
        }
        if (!job?.id) {
          writeJson(res, 500, { ok: false, error: "background_job_unavailable" }, origin);
          return true;
        }
        await runBackgroundJobNow(api, job.id);
        writeJson(
          res,
          200,
          formatBackgroundJobStatus({
            ...job,
            enabled: true,
            state: {
              ...(job.state ?? {}),
              runningAtMs: job.state?.runningAtMs ?? Date.now(),
            },
          }),
          origin
        );
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
      }
      return true;
    }

    if (routeName === "send") {
      if (req.method !== "POST") {
        writeText(res, 405, "Method Not Allowed", origin);
        return true;
      }
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        writeJson(res, 400, { ok: false, error: "invalid_json" }, origin);
        return true;
      }
      const sessionKey =
        typeof body.sessionKey === "string" && body.sessionKey.trim()
          ? body.sessionKey.trim()
          : runtimeSessionKey;
      if (sessionKey !== runtimeSessionKey && sessionKey !== bridgeConfig.defaultSessionKey) {
        writeJson(res, 400, { ok: false, error: "invalid_session_key" }, origin);
        return true;
      }
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        writeJson(res, 400, { ok: false, error: "message_required" }, origin);
        return true;
      }
      try {
        const run = await api.runtime.subagent.run({
          sessionKey: runtimeSessionKey,
          message: text,
          deliver: false,
          idempotencyKey: `agentbox-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });
        writeJson(
          res,
          200,
          {
            ok: true,
            sessionKey: runtimeSessionKey,
            runId: run.runId,
          },
          origin
        );
      } catch (error) {
        writeJson(
          res,
          500,
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          origin
        );
      }
      return true;
    }

    if (routeName === "stream") {
      const sessionKey = runtimeSessionKey;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...createCorsHeaders(origin),
      });
      const clientId = hub.addClient(sessionKey, res);
      req.on("close", () => {
        hub.removeClient(clientId);
      });
      return true;
    }

    writeJson(res, 404, { ok: false, error: "route_not_found" }, origin);
    return true;
  };
}

function registerBridgeCli(api) {
  api.registerCli(
    ({ program }) => {
      const agentboxCommand = program.command("agentbox").description("Agentbox plugin utilities.");
      const bridgeToken = agentboxCommand.command("bridge-token").description("Show or rotate the OpenClaw bridge token.");
      bridgeToken
        .command("show")
        .description("Print the current bridge token.")
        .option("--json", "Output JSON", false)
        .action(async (options) => {
          const bridgeConfig = readBridgeConfig(api);
          const token = bridgeConfig.token || (await writeBridgeConfig(api, { token: randomBridgeToken() })).token;
          if (options.json) {
            console.log(JSON.stringify({ token }, null, 2));
            return;
          }
          console.log(token);
        });
      bridgeToken
        .command("rotate")
        .description("Rotate the bridge token and print the new value.")
        .option("--json", "Output JSON", false)
        .action(async (options) => {
          const token = randomBridgeToken();
          await writeBridgeConfig(api, { token });
          if (options.json) {
            console.log(JSON.stringify({ token }, null, 2));
            return;
          }
          console.log(token);
        });
    },
    {
      descriptors: [
        {
          name: "agentbox",
          description: "Agentbox plugin utilities",
          hasSubcommands: true,
        },
      ],
    }
  );
}

function registerBridgeRoutes(api, hub, pairingManager, runtime) {
  const routes = [
    { path: "/plugins/agentbox-skills/bridge/status", routeName: "status", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/pair/start", routeName: "pair-start", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/pair/complete", routeName: "pair-complete", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/pair/approve", routeName: "pair-approve", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/pair/approve-page", routeName: "pair-approve-page", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/auth/verify", routeName: "auth-verify", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/session/ensure", routeName: "session-ensure", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/history", routeName: "history", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/game/active-role", routeName: "game-active-role", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/status", routeName: "account-status", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/signer/prepare", routeName: "account-signer-prepare", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/signer/import", routeName: "account-signer-import", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/signer/export", routeName: "account-signer-export", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/registration/confirm", routeName: "account-registration-confirm", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/roles", routeName: "account-roles", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/roles/active", routeName: "account-roles-active", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/roles/select", routeName: "account-roles-select", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/account/roles/clear", routeName: "account-roles-clear", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/operations/state", routeName: "operations-state", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/background/status", routeName: "background-status", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/background/start", routeName: "background-start", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/background/stop", routeName: "background-stop", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/background/run-now", routeName: "background-run-now", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/background/update-goal", routeName: "background-update-goal", auth: "plugin" },
    { path: "/plugins/agentbox-skills/bridge/send", routeName: "send", auth: "gateway" },
    { path: "/plugins/agentbox-skills/bridge/stream", routeName: "stream", auth: "plugin" },
  ];
  for (const route of routes) {
    api.registerHttpRoute({
      path: route.path,
      auth: route.auth,
      match: "exact",
      replaceExisting: true,
      ...(route.routeName === "send" ? { gatewayRuntimeScopeSurface: "trusted-operator" } : {}),
      handler: createBridgeHandler(api, hub, pairingManager, route.routeName, runtime),
    });
  }
}

function registerBridge(api, runtime) {
  const hub = new OpenClawBridgeHub(api);
  const pairingManager = new OpenClawBridgePairingManager(api);
  api.registerService({
    id: "agentbox-bridge-sse",
    start: async () => {
      hub.start();
    },
    stop: async () => {
      hub.stop();
    },
  });
  registerBridgeCli(api);
  registerBridgeRoutes(api, hub, pairingManager, runtime);
}

export {
  createBridgeConfigSchema,
  normalizeBridgeConfig,
  readBridgeConfig,
  registerBridge,
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_BRIDGE_SESSION_KEY,
  DEFAULT_SSE_HEARTBEAT_MS,
};
