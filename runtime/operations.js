import path from "node:path";

import { ensureDir, precheckError, readJsonFile, utcNowIso, writeJsonFile } from "./common.js";

const OPERATION_STATE_VERSION = 1;
const MAX_COMPLETED_OPERATIONS = 100;

const OPERATION_STATUSES = new Set(["planned", "running", "completed", "failed", "cancelled", "blocked"]);
const ACTION_STATUSES = new Set(["pending", "in_progress", "completed", "failed", "skipped", "cancelled"]);
const PLAN_SOURCES = new Set(["agent", "user", "cron", "manual", "ad_hoc_write"]);

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeRoleWallet(roleWallet) {
  if (typeof roleWallet !== "string" || !roleWallet.trim()) {
    throw precheckError("MISSING_ROLE_WALLET", "A roleWallet is required for operation state");
  }
  return roleWallet.trim().toLowerCase();
}

function timestampId(prefix) {
  const stamp = utcNowIso().replace(/\D/g, "");
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${stamp}_${random}`;
}

function normalizeSource(source, fallback = "agent") {
  const normalized = typeof source === "string" ? source.trim() : "";
  return PLAN_SOURCES.has(normalized) ? normalized : fallback;
}

function normalizeActionStatus(status, fallback = "pending") {
  const normalized = typeof status === "string" ? status.trim() : "";
  if (!ACTION_STATUSES.has(normalized)) {
    throw precheckError("INVALID_ACTION_STATUS", `Invalid action status: ${status}`, {
      allowedStatuses: [...ACTION_STATUSES],
    });
  }
  return normalized || fallback;
}

function normalizeOperationStatus(status, fallback = "planned") {
  const normalized = typeof status === "string" ? status.trim() : "";
  if (!OPERATION_STATUSES.has(normalized)) {
    throw precheckError("INVALID_OPERATION_STATUS", `Invalid operation status: ${status}`, {
      allowedStatuses: [...OPERATION_STATUSES],
    });
  }
  return normalized || fallback;
}

function normalizePriority(priority) {
  const numeric = Number(priority ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeAction(action, index = 0) {
  if (!action || typeof action !== "object") {
    throw precheckError("INVALID_ACTION", "Each operation action must be an object", { index });
  }
  const type = typeof action.type === "string" && action.type.trim() ? action.type.trim() : "";
  if (!type) {
    throw precheckError("MISSING_ACTION_TYPE", "Each operation action requires a type", { index });
  }
  const now = utcNowIso();
  return {
    actionId: typeof action.actionId === "string" && action.actionId.trim() ? action.actionId.trim() : timestampId("act"),
    type,
    toolName: typeof action.toolName === "string" && action.toolName.trim() ? action.toolName.trim() : null,
    params: action.params && typeof action.params === "object" ? cloneJson(action.params) : {},
    expectedResult: typeof action.expectedResult === "string" ? action.expectedResult : "",
    status: normalizeActionStatus(action.status || "pending"),
    createdAt: action.createdAt || now,
    startedAt: action.startedAt || null,
    finishedAt: action.finishedAt || null,
    txHash: action.txHash || null,
    blockNumber: action.blockNumber ?? null,
    chainId: action.chainId ?? null,
    errorCode: action.errorCode || null,
    errorMessage: action.errorMessage || null,
    events: Array.isArray(action.events) ? cloneJson(action.events) : [],
  };
}

function normalizeOperation(input, status = "planned") {
  if (!input || typeof input !== "object") {
    throw precheckError("INVALID_OPERATION", "Operation must be an object");
  }
  const goal = typeof input.goal === "string" && input.goal.trim() ? input.goal.trim() : "";
  if (!goal) {
    throw precheckError("MISSING_OPERATION_GOAL", "Operation goal is required");
  }
  const actions = Array.isArray(input.actions) ? input.actions.map((action, index) => normalizeAction(action, index)) : [];
  if (actions.length === 0) {
    throw precheckError("MISSING_OPERATION_ACTIONS", "Operation requires at least one structured action");
  }
  const now = utcNowIso();
  return {
    operationId:
      typeof input.operationId === "string" && input.operationId.trim() ? input.operationId.trim() : timestampId("op"),
    goal,
    source: normalizeSource(input.source),
    priority: normalizePriority(input.priority),
    status: normalizeOperationStatus(input.status || status),
    createdAt: input.createdAt || now,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    actions,
  };
}

function makeEmptyState(role) {
  const now = utcNowIso();
  return {
    version: OPERATION_STATE_VERSION,
    role: {
      roleId: role?.roleId ?? null,
      roleWallet: role?.roleWallet ?? null,
      ownerAddress: role?.ownerAddress ?? null,
    },
    currentOperation: null,
    plannedOperations: [],
    completedOperations: [],
    updatedAt: now,
  };
}

function normalizeState(rawState, role) {
  const state = rawState && typeof rawState === "object" ? rawState : makeEmptyState(role);
  return {
    version: OPERATION_STATE_VERSION,
    role: {
      roleId: role?.roleId ?? state.role?.roleId ?? null,
      roleWallet: role?.roleWallet ?? state.role?.roleWallet ?? null,
      ownerAddress: role?.ownerAddress ?? state.role?.ownerAddress ?? null,
    },
    currentOperation: state.currentOperation || null,
    plannedOperations: Array.isArray(state.plannedOperations) ? state.plannedOperations : [],
    completedOperations: Array.isArray(state.completedOperations) ? state.completedOperations : [],
    updatedAt: state.updatedAt || utcNowIso(),
  };
}

function sortPlannedOperations(operations) {
  return [...operations].sort((a, b) => {
    const priorityDelta = normalizePriority(b.priority) - normalizePriority(a.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

function pushCompleted(state, operation) {
  state.completedOperations = [operation, ...state.completedOperations].slice(0, MAX_COMPLETED_OPERATIONS);
}

function appendEvent(action, event) {
  action.events ??= [];
  action.events.push({
    at: utcNowIso(),
    ...event,
  });
}

function closeRemainingActions(operation, status) {
  const actionStatus = status === "cancelled" ? "cancelled" : "skipped";
  for (const action of operation.actions || []) {
    if (action.status === "pending" || action.status === "in_progress") {
      action.status = actionStatus;
      action.finishedAt = action.finishedAt || utcNowIso();
      appendEvent(action, {
        kind: status === "cancelled" ? "auto_cancelled_with_operation" : "auto_skipped_with_operation",
      });
    }
  }
}

function actionMatchesTool(action, toolName, params = {}) {
  if (!action || !["pending", "in_progress"].includes(action.status)) return false;
  if (action.toolName && action.toolName === toolName) return true;
  if (action.type === toolName) return true;
  const normalizedType = String(action.type || "").replaceAll("_", ".").toLowerCase();
  const normalizedTool = String(toolName || "").replaceAll("_", ".").toLowerCase();
  if (normalizedType && normalizedTool.endsWith(normalizedType)) return true;
  if (!action.toolName && action.params && params) {
    const actionRole = action.params.role ? String(action.params.role).toLowerCase() : null;
    const paramsRole = params.role ? String(params.role).toLowerCase() : null;
    if (actionRole && paramsRole && actionRole !== paramsRole) return false;
  }
  return false;
}

function createAdHocOperation({ role, toolName, params, result, status }) {
  const now = utcNowIso();
  const action = normalizeAction({
    type: toolName,
    toolName,
    params,
    status,
    startedAt: now,
    finishedAt: now,
    txHash: result?.txHash ?? null,
    blockNumber: result?.blockNumber ?? null,
    chainId: result?.chainId ?? null,
    errorCode: result?.errorCode ?? null,
    errorMessage: result?.errorMessage ?? null,
    events: [
      {
        at: now,
        kind: status === "completed" ? "auto_completed" : "auto_failed",
        summary: result?.summary || null,
      },
    ],
  });
  return {
    operationId: timestampId("op_ad_hoc"),
    goal: `Ad-hoc write: ${toolName}`,
    source: "ad_hoc_write",
    priority: 0,
    status: status === "completed" ? "completed" : "failed",
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    role,
    actions: [action],
  };
}

export class OperationStore {
  constructor(settings) {
    this.settings = settings;
    this.operationsDir = path.join(settings.dataDir, "operations");
  }

  statePathForRole(roleWallet) {
    const normalized = normalizeRoleWallet(roleWallet);
    return path.join(this.operationsDir, `${normalized}.json`);
  }

  load(role) {
    ensureDir(this.operationsDir);
    const state = normalizeState(readJsonFile(this.statePathForRole(role.roleWallet), null), role);
    return state;
  }

  save(role, state) {
    const nextState = normalizeState(state, role);
    nextState.updatedAt = utcNowIso();
    writeJsonFile(this.statePathForRole(role.roleWallet), nextState);
    return nextState;
  }

  readState(role) {
    return this.load(role);
  }

  addPlan(role, payload) {
    const state = this.load(role);
    const operation = normalizeOperation(payload, "planned");
    state.plannedOperations = sortPlannedOperations([...state.plannedOperations, operation]);
    return this.save(role, state);
  }

  startNext(role) {
    const state = this.load(role);
    if (state.currentOperation) {
      return this.save(role, state);
    }
    const planned = sortPlannedOperations(state.plannedOperations);
    const next = planned.shift();
    if (!next) return this.save(role, state);
    next.status = "running";
    next.startedAt = next.startedAt || utcNowIso();
    state.currentOperation = next;
    state.plannedOperations = planned;
    return this.save(role, state);
  }

  nextAction(role) {
    const state = this.load(role);
    const current = state.currentOperation;
    if (!current) {
      return {
        state,
        hasCurrentOperation: false,
        operationId: null,
        action: null,
        reason: state.plannedOperations.length > 0 ? "no_current_operation_start_next_available" : "no_operation_available",
        recommendedToolName: null,
        recommendedParams: null,
      };
    }
    const action = (current.actions || []).find((item) => item.status === "pending" || item.status === "in_progress") || null;
    return {
      state,
      hasCurrentOperation: true,
      operationId: current.operationId,
      action,
      reason: action ? "next_action_available" : "no_pending_action",
      recommendedToolName: action?.toolName || null,
      recommendedParams: action?.params || null,
    };
  }

  updateAction(role, payload) {
    const state = this.load(role);
    const { operationId, actionId } = payload || {};
    if (!operationId || !actionId) {
      throw precheckError("MISSING_OPERATION_ACTION_ID", "operationId and actionId are required");
    }
    const operation =
      state.currentOperation?.operationId === operationId
        ? state.currentOperation
        : state.plannedOperations.find((item) => item.operationId === operationId) ||
          state.completedOperations.find((item) => item.operationId === operationId);
    if (!operation) throw precheckError("UNKNOWN_OPERATION", "Operation was not found", { operationId });
    const action = (operation.actions || []).find((item) => item.actionId === actionId);
    if (!action) throw precheckError("UNKNOWN_ACTION", "Action was not found", { operationId, actionId });
    const status = normalizeActionStatus(payload.status || action.status);
    action.status = status;
    if (status === "in_progress") action.startedAt = action.startedAt || utcNowIso();
    if (["completed", "failed", "skipped", "cancelled"].includes(status)) action.finishedAt = payload.finishedAt || utcNowIso();
    for (const key of ["txHash", "blockNumber", "chainId", "errorCode", "errorMessage"]) {
      if (payload[key] !== undefined) action[key] = payload[key];
    }
    if (payload.note) appendEvent(action, { kind: "note", note: String(payload.note) });
    return this.save(role, state);
  }

  finishCurrent(role, payload = {}) {
    const state = this.load(role);
    if (!state.currentOperation) return this.save(role, state);
    const operation = state.currentOperation;
    const status = normalizeOperationStatus(payload.status || "completed");
    operation.status = status;
    operation.finishedAt = payload.finishedAt || utcNowIso();
    closeRemainingActions(operation, status);
    if (payload.note) operation.note = String(payload.note);
    pushCompleted(state, operation);
    state.currentOperation = null;
    return this.save(role, state);
  }

  cancelCurrent(role, payload = {}) {
    return this.finishCurrent(role, { ...payload, status: "cancelled" });
  }

  clearCompleted(role) {
    const state = this.load(role);
    state.completedOperations = [];
    return this.save(role, state);
  }

  reconcile(role, payload = {}, chainState = null) {
    const state = this.load(role);
    const suggestions = [];
    const current = state.currentOperation;
    if (!current) {
      return { state, applied: false, suggestions: [{ kind: "no_current_operation" }] };
    }
    if (chainState?.dynamicInfo?.role?.stateName) {
      suggestions.push({
        kind: "chain_state_observed",
        stateName: chainState.dynamicInfo.role.stateName,
      });
    }
    if ((current.actions || []).every((action) => action.status === "completed" || action.status === "skipped")) {
      suggestions.push({ kind: "current_operation_actions_finished", recommendedStatus: "completed" });
      if (payload.apply === true) {
        const nextState = this.finishCurrent(role, { status: "completed", note: "reconcile completed all actions" });
        return { state: nextState, applied: true, suggestions };
      }
    }
    return { state, applied: false, suggestions };
  }

  markWriteStarted(role, toolName, params) {
    const state = this.load(role);
    if (!state.currentOperation) {
      return { state, operation: null, action: null, createdAdHoc: false };
    }
    const action = (state.currentOperation.actions || []).find((item) => actionMatchesTool(item, toolName, params));
    if (!action) {
      const adHoc = normalizeAction({
        type: toolName,
        toolName,
        params,
        status: "in_progress",
        startedAt: utcNowIso(),
        events: [{ at: utcNowIso(), kind: "auto_started_ad_hoc_action" }],
      });
      state.currentOperation.actions ??= [];
      state.currentOperation.actions.push(adHoc);
      this.save(role, state);
      return { state, operation: state.currentOperation, action: adHoc, createdAdHoc: true };
    }
    action.status = "in_progress";
    action.startedAt = action.startedAt || utcNowIso();
    action.toolName = action.toolName || toolName;
    action.params = action.params && Object.keys(action.params).length > 0 ? action.params : cloneJson(params);
    appendEvent(action, { kind: "auto_started", toolName });
    this.save(role, state);
    return { state, operation: state.currentOperation, action, createdAdHoc: false };
  }

  markWriteFinished(role, tracking, toolName, params, result) {
    const state = this.load(role);
    if (!tracking?.operation?.operationId || !tracking?.action?.actionId) {
      const adHocOperation = createAdHocOperation({ role: state.role, toolName, params, result, status: "completed" });
      pushCompleted(state, adHocOperation);
      return this.save(role, state);
    }
    const operation = state.currentOperation?.operationId === tracking.operation.operationId ? state.currentOperation : null;
    const action = operation?.actions?.find((item) => item.actionId === tracking.action.actionId);
    if (!action) return this.save(role, state);
    action.status = "completed";
    action.finishedAt = utcNowIso();
    action.txHash = result?.txHash ?? action.txHash;
    action.blockNumber = result?.blockNumber ?? action.blockNumber;
    action.chainId = result?.chainId ?? action.chainId;
    appendEvent(action, { kind: "auto_completed", summary: result?.summary || null });
    return this.save(role, state);
  }

  markWriteFailed(role, tracking, toolName, params, result) {
    const state = this.load(role);
    if (!tracking?.operation?.operationId || !tracking?.action?.actionId) {
      const adHocOperation = createAdHocOperation({ role: state.role, toolName, params, result, status: "failed" });
      pushCompleted(state, adHocOperation);
      return this.save(role, state);
    }
    const operation = state.currentOperation?.operationId === tracking.operation.operationId ? state.currentOperation : null;
    const action = operation?.actions?.find((item) => item.actionId === tracking.action.actionId);
    if (!action) return this.save(role, state);
    action.status = "failed";
    action.finishedAt = utcNowIso();
    action.errorCode = result?.errorCode || action.errorCode;
    action.errorMessage = result?.errorMessage || action.errorMessage;
    appendEvent(action, { kind: "auto_failed", errorCode: result?.errorCode || null });
    return this.save(role, state);
  }
}
