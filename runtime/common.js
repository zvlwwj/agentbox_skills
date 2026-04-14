import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ROLE_STATE_IDLE = 0;
export const ROLE_STATE_LEARNING = 1;
export const ROLE_STATE_TEACHING = 2;
export const ROLE_STATE_CRAFTING = 3;
export const ROLE_STATE_GATHERING = 4;
export const ROLE_STATE_TELEPORTING = 5;
export const ROLE_STATE_PENDING_SPAWN = 6;
export const DEFAULT_ROLE_RESOURCE_TOKEN_IDS = [1, 2, 3];
export const DEFAULT_ROLE_EQUIPMENT_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
export const NEARBY_COORDINATE_DELTA = 100;
export const PAGE_SIZE = 200;
export const DEFAULT_SIGNER_LABEL = "local-gameplay-signer";
export const LAND_COORDINATE_NOTE = "Coordinates are always ordered as (x, y). Do not infer x/y by splitting the digits of landId.";

export const ADDRESS = { type: "string", description: "EVM address" };
export const UINT = { type: "integer", minimum: 0 };
export const STRING = { type: "string" };
export const PROFILE_MODE = { type: "string", enum: ["manual", "skip", "auto_generate"] };
export const READ_SOURCE = { type: "string", enum: ["auto", "chain", "indexer"] };
export const ROLE = { type: "string", description: "Role entity reference address" };
export const TARGET_WALLET = { type: "string", description: "Target address for another entity or wallet" };

export function obj(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const ROLE_STATE_BY_NAME = {
  idle: ROLE_STATE_IDLE,
  learning: ROLE_STATE_LEARNING,
  teaching: ROLE_STATE_TEACHING,
  crafting: ROLE_STATE_CRAFTING,
  gathering: ROLE_STATE_GATHERING,
  teleporting: ROLE_STATE_TELEPORTING,
  pendingspawn: ROLE_STATE_PENDING_SPAWN,
};

export function normalizeRoleState(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "string") {
    const stripped = value.trim();
    if (!stripped) return null;
    if (/^\d+$/.test(stripped)) return Number(stripped);
    return ROLE_STATE_BY_NAME[stripped.toLowerCase()] ?? null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

export class AgentboxPluginError extends Error {
  constructor(errorCode, message, { retryable = false, data = {} } = {}) {
    super(message);
    this.name = "AgentboxPluginError";
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.data = data;
  }

  toResult(action) {
    return {
      ok: false,
      action,
      errorCode: this.errorCode,
      errorMessage: this.message,
      retryable: this.retryable,
      data: this.data || {},
      txHash: null,
    };
  }
}

export function precheckError(code, message, data = {}) {
  return new AgentboxPluginError(`PRECHECK_${code}`, message, { retryable: false, data });
}

export function rpcError(code, message, data = {}) {
  return new AgentboxPluginError(`RPC_${code}`, message, { retryable: true, data });
}

export function txError(code, message, data = {}) {
  return new AgentboxPluginError(`TX_${code}`, message, { retryable: true, data });
}

export function revertError(code, message, data = {}) {
  return new AgentboxPluginError(`REVERT_${code}`, message, { retryable: false, data });
}

export function mapException(error) {
  if (error instanceof AgentboxPluginError) return error;
  const text = String(error?.message || error || "");
  const lowered = text.toLowerCase();
  if (lowered.includes("execution reverted")) return revertError("CONTRACT_REVERT", text);
  if (lowered.includes("timeout")) return txError("TIMEOUT", text);
  if (lowered.includes("nonce")) return txError("NONCE", text);
  return rpcError("UNEXPECTED", text);
}

export function successResult(action, summary, { data = {}, txHash, chainId, blockNumber } = {}) {
  const result = { ok: true, action, summary, data };
  if (txHash !== undefined) result.txHash = txHash;
  if (chainId !== undefined) result.chainId = chainId;
  if (blockNumber !== undefined) result.blockNumber = blockNumber;
  return result;
}

export function errorResult(action, error) {
  return mapException(error).toResult(action);
}

export function normalizeValue(value) {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^\d+$/.test(key)) continue;
      out[key] = normalizeValue(item);
    }
    return Object.keys(out).length > 0 ? out : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeValue(v)]));
  }
  return value;
}

export function decodeField(value, index, key) {
  if (Array.isArray(value)) return normalizeValue(value[index]);
  if (value && typeof value === "object" && key in value) return normalizeValue(value[key]);
  return undefined;
}

export function decodeCoreContracts(value) {
  return {
    roleContract: decodeField(value, 0, "roleContract"),
    configContract: decodeField(value, 1, "configContract"),
    economyContract: decodeField(value, 2, "economyContract"),
    randomizerContract: decodeField(value, 3, "randomizerContract"),
    resourceContract: decodeField(value, 4, "resourceContract"),
    landContract: decodeField(value, 5, "landContract"),
  };
}

export function decodeGlobalConfig(value) {
  return {
    mapWidth: decodeField(value, 0, "mapWidth"),
    mapHeight: decodeField(value, 1, "mapHeight"),
    mintIntervalBlocks: decodeField(value, 2, "mintIntervalBlocks"),
    mintAmount: decodeField(value, 3, "mintAmount"),
    stabilizationBlocks: decodeField(value, 4, "stabilizationBlocks"),
    craftDurationBlocks: decodeField(value, 5, "craftDurationBlocks"),
    halvingIntervalBlocks: decodeField(value, 6, "halvingIntervalBlocks"),
    landPrice: decodeField(value, 7, "landPrice"),
  };
}

export function decodeRoleIdentity(value) {
  return {
    isValidRole: decodeField(value, 0, "isValidRole"),
    roleId: decodeField(value, 1, "roleId"),
    owner: decodeField(value, 2, "owner"),
    controller: decodeField(value, 3, "controller"),
  };
}

export function decodeRoleSnapshot(value) {
  return {
    exists: decodeField(value, 0, "exists"),
    state: decodeField(value, 1, "state"),
    x: decodeField(value, 2, "x"),
    y: decodeField(value, 3, "y"),
    speed: decodeField(value, 4, "speed"),
    attack: decodeField(value, 5, "attack"),
    defense: decodeField(value, 6, "defense"),
    hp: decodeField(value, 7, "hp"),
    maxHp: decodeField(value, 8, "maxHp"),
    range: decodeField(value, 9, "range"),
    mp: decodeField(value, 10, "mp"),
  };
}

export function decodeRoleActionSnapshot(value) {
  const keys = [
    "craftingStartBlock",
    "craftingRequiredBlocks",
    "craftingRecipeId",
    "learningStartBlock",
    "learningRequiredBlocks",
    "learningTargetId",
    "learningSkillId",
    "learningIsNPC",
    "learningTeacherWallet",
    "teachingStartBlock",
    "teachingRequiredBlocks",
    "teachingSkillId",
    "teachingStudentWallet",
    "teleportStartBlock",
    "teleportRequiredBlocks",
    "teleportTargetX",
    "teleportTargetY",
    "gatheringStartBlock",
    "gatheringRequiredBlocks",
    "gatheringTargetLandId",
    "gatheringAmount",
  ];
  const out = {};
  for (const [index, key] of keys.entries()) out[key] = decodeField(value, index, key);
  return out;
}

export function decodeLandSnapshot(value) {
  return {
    landId: decodeField(value, 0, "landId"),
    x: decodeField(value, 1, "x"),
    y: decodeField(value, 2, "y"),
    owner: decodeField(value, 3, "owner"),
    landContractAddress: decodeField(value, 4, "landContractAddress"),
    isResourcePoint: decodeField(value, 5, "isResourcePoint"),
    resourceType: decodeField(value, 6, "resourceType"),
    groundTokens: decodeField(value, 7, "groundTokens"),
  };
}

export function decodeNpcSnapshot(value) {
  return {
    skillId: decodeField(value, 0, "skillId"),
    x: decodeField(value, 1, "x"),
    y: decodeField(value, 2, "y"),
    startBlock: decodeField(value, 3, "startBlock"),
    isTeaching: decodeField(value, 4, "isTeaching"),
    studentWallet: decodeField(value, 5, "studentWallet"),
  };
}

export function decodeRecipeSnapshot(value) {
  return {
    requiredResources: decodeField(value, 0, "requiredResources"),
    requiredAmounts: decodeField(value, 1, "requiredAmounts"),
    requiredSkill: decodeField(value, 2, "requiredSkill"),
    requiredBlocks: decodeField(value, 3, "requiredBlocks"),
    outputEquipmentId: decodeField(value, 4, "outputEquipmentId"),
  };
}

export function decodeEquipmentSnapshot(value) {
  return {
    slot: decodeField(value, 0, "slot"),
    speedBonus: decodeField(value, 1, "speedBonus"),
    attackBonus: decodeField(value, 2, "attackBonus"),
    defenseBonus: decodeField(value, 3, "defenseBonus"),
    maxHpBonus: decodeField(value, 4, "maxHpBonus"),
    rangeBonus: decodeField(value, 5, "rangeBonus"),
  };
}

export function buildCoordinateConvention(mapWidth = null) {
  return {
    order: ["x", "y"],
    format: "(x, y)",
    landIdFormula: mapWidth ? `landId = y * ${mapWidth} + x` : "landId = y * mapWidth + x",
    note: LAND_COORDINATE_NOTE,
  };
}

export function decodeEconomyBalances(value) {
  return {
    totalBalance: decodeField(value, 0, "totalBalance"),
    unreliableBalance: decodeField(value, 1, "unreliableBalance"),
    reliableBalance: decodeField(value, 2, "reliableBalance"),
  };
}

export function decodeFinishable(value) {
  return {
    canFinish: decodeField(value, 0, "canFinish"),
    state: decodeField(value, 1, "state"),
    finishBlock: decodeField(value, 2, "finishBlock"),
  };
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function utcNowIso() {
  return new Date().toISOString();
}

export function formatEth(wei, formatEther) {
  return formatEther(BigInt(wei)).toString();
}

export function defaultDataDir() {
  return path.join(os.homedir(), ".openclaw", "skills", "agentbox-skills", ".data");
}
