import { ethers } from "ethers";

import {
  ADDRESS,
  DEFAULT_ROLE_EQUIPMENT_SLOTS,
  DEFAULT_ROLE_RESOURCE_TOKEN_IDS,
  BOOL,
  PAGE_SIZE,
  PROFILE_MODE,
  READ_SOURCE,
  ROLE,
  ROLE_STATE_CRAFTING,
  ROLE_STATE_GATHERING,
  ROLE_STATE_IDLE,
  ROLE_STATE_LEARNING,
  ROLE_STATE_PENDING_SPAWN,
  ROLE_STATE_TEACHING,
  ROLE_STATE_TELEPORTING,
  STRING,
  TARGET_WALLET,
  UINT,
  ZERO_ADDRESS,
  buildCoordinateConvention,
  decodeEconomyBalances,
  errorResult,
  equipmentNameFromId,
  normalizeValue,
  npcNameFromId,
  normalizeRoleState,
  obj,
  precheckError,
  recipeNameFromId,
  resourceNameFromId,
  roleStateNameFromValue,
  skillNameFromId,
  slotNameFromId,
  successResult,
  txError,
} from "./common.js";
import { ActiveRoleStore, AgentboxClient, SignerStore, loadSettings } from "./clients.js";

function learnedSkillIds(me) {
  return new Set((me.skills || []).filter((item) => item.learned).map((item) => Number(item.skillId || 0)));
}

function resourceAmounts(me) {
  const out = {};
  for (const item of me.resourceBalances || []) out[Number(item.tokenId || 0)] = Number(item.amount || 0);
  return out;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildToolSpecs() {
  return [
    { name: "agentbox.signer.prepare", description: "Create the single local gameplay private key. If a signer already exists, replacing it requires force=true, backupConfirmed=true, and confirmSignerReplacement=true.", parameters: obj({ label: STRING, force: BOOL, backupConfirmed: BOOL, confirmSignerReplacement: BOOL }) },
    { name: "agentbox.signer.import", description: "Import the single local gameplay private key. If a signer already exists, replacing it requires force=true, backupConfirmed=true, and confirmSignerReplacement=true.", parameters: obj({ privateKey: STRING, label: STRING, force: BOOL, backupConfirmed: BOOL, confirmSignerReplacement: BOOL }, ["privateKey"]) },
    { name: "agentbox.signer.export", description: "Export the currently stored local gameplay private key.", parameters: obj({}) },
    { name: "agentbox.signer.read", description: "Read the current local signer state.", parameters: obj({}) },
    { name: "agentbox.registration.confirm", description: "Confirm direct registration with the active signer and continue registration.", parameters: obj({ profileMode: PROFILE_MODE, nickname: STRING, gender: UINT }) },
    { name: "agentbox.roles.list_owned", description: "List all game roles owned by the active signer owner address.", parameters: obj({}) },
    { name: "agentbox.roles.read_active", description: "Read the currently selected active role.", parameters: obj({}) },
    { name: "agentbox.roles.select_active", description: "Select the active role used when role is omitted.", parameters: obj({ roleWallet: ROLE, roleId: UINT }) },
    { name: "agentbox.roles.clear_active", description: "Clear the currently selected active role.", parameters: obj({}) },
    { name: "agentbox.skills.read_role_snapshot", description: "Read the current role snapshot grouped into staticInfo and dynamicInfo.", parameters: obj({ role: ROLE, source: READ_SOURCE }) },
    { name: "agentbox.skills.read_world_static_info", description: "Read lower-frequency world facts used for planning.", parameters: obj({ role: ROLE, source: READ_SOURCE }) },
    { name: "agentbox.skills.read_world_dynamic_info", description: "Read frequently changing world facts near the current role.", parameters: obj({ role: ROLE, source: READ_SOURCE }) },
    { name: "agentbox.skills.read_nearby_roles", description: "Read nearby roles around the current role.", parameters: obj({ role: ROLE, source: READ_SOURCE }, ["role"]) },
    { name: "agentbox.skills.read_nearby_lands", description: "Read nearby lands around the current role.", parameters: obj({ role: ROLE, source: READ_SOURCE }, ["role"]) },
    { name: "agentbox.skills.read_land", description: "Read one land by landId or coordinate.", parameters: obj({ landId: UINT, x: UINT, y: UINT, source: READ_SOURCE }) },
    { name: "agentbox.skills.read_last_mint", description: "Read the last mint event observed by the indexer.", parameters: obj({}) },
    { name: "agentbox.skills.read_lands_with_ground_tokens", description: "Read all lands that currently have ground tokens.", parameters: obj({}) },
    { name: "agentbox.skills.read_global_config", description: "Read current global config values.", parameters: obj({ source: READ_SOURCE }) },
    { name: "agentbox.skills.move.instant", description: "Submit an instant move to a target coordinate.", parameters: obj({ role: ROLE, x: UINT, y: UINT }, ["role", "x", "y"]) },
    { name: "agentbox.skills.teleport.start", description: "Start teleporting to a target coordinate.", parameters: obj({ role: ROLE, x: UINT, y: UINT }, ["role", "x", "y"]) },
    { name: "agentbox.skills.finish_current_action", description: "Finish the current action if it is finishable.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.gather.start", description: "Start gathering on the current resource land.", parameters: obj({ role: ROLE, amount: UINT }, ["role", "amount"]) },
    { name: "agentbox.skills.learn.npc.start", description: "Start learning from a nearby NPC.", parameters: obj({ role: ROLE, npcId: UINT }, ["role", "npcId"]) },
    { name: "agentbox.skills.learn.player.request", description: "Request learning a skill from another player.", parameters: obj({ role: ROLE, teacherWallet: TARGET_WALLET, skillId: UINT }, ["role", "teacherWallet", "skillId"]) },
    { name: "agentbox.skills.learn.player.accept", description: "Accept teaching another player.", parameters: obj({ role: ROLE, studentWallet: TARGET_WALLET }, ["role", "studentWallet"]) },
    { name: "agentbox.skills.craft.start", description: "Start crafting a recipe.", parameters: obj({ role: ROLE, recipeId: UINT }, ["role", "recipeId"]) },
    { name: "agentbox.skills.combat.attack", description: "Attack another nearby player.", parameters: obj({ role: ROLE, targetWallet: TARGET_WALLET }, ["role", "targetWallet"]) },
    { name: "agentbox.skills.equip.put_on", description: "Equip an owned equipment item.", parameters: obj({ role: ROLE, equipmentId: UINT }, ["role", "equipmentId"]) },
    { name: "agentbox.skills.equip.take_off", description: "Unequip an equipment slot.", parameters: obj({ role: ROLE, slot: UINT }, ["role", "slot"]) },
    { name: "agentbox.skills.land.buy", description: "Buy the current target land.", parameters: obj({ role: ROLE, x: UINT, y: UINT }, ["role", "x", "y"]) },
    { name: "agentbox.skills.land.set_contract", description: "Set a contract address on a land you own.", parameters: obj({ role: ROLE, x: UINT, y: UINT, contractAddress: ADDRESS }, ["role", "x", "y", "contractAddress"]) },
    { name: "agentbox.skills.social.dm", description: "Send a direct message to another player.", parameters: obj({ role: ROLE, toWallet: TARGET_WALLET, message: STRING }, ["role", "toWallet", "message"]) },
    { name: "agentbox.skills.social.global", description: "Send a global message.", parameters: obj({ role: ROLE, message: STRING }, ["role", "message"]) },
    { name: "agentbox.skills.cancel_current_action", description: "Cancel the current cancelable action.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.trigger_mint", description: "Trigger token mint when mint prerequisites are satisfied.", parameters: obj({}) },
    { name: "agentbox.skills.stabilize_balance", description: "Stabilize matured unreliable AGC for the role wallet.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.transfer_agc_to_owner", description: "Transfer reliable AGC from the role wallet back to the current owner address.", parameters: obj({ role: ROLE, amount: UINT }, ["role", "amount"]) },
    { name: "agentbox.skills.check_finishable", description: "Check whether the current action can finish now.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.check_gather_prerequisites", description: "Check whether gathering can start on the current land.", parameters: obj({ role: ROLE, amount: UINT }, ["role", "amount"]) },
    { name: "agentbox.skills.check_learning_prerequisites", description: "Check whether learning from an NPC can start now.", parameters: obj({ role: ROLE, npcId: UINT }, ["role", "npcId"]) },
    { name: "agentbox.skills.check_crafting_prerequisites", description: "Check whether crafting a recipe can start now.", parameters: obj({ role: ROLE, recipeId: UINT }, ["role", "recipeId"]) },
    { name: "agentbox.skills.check_trigger_mint_prerequisites", description: "Check whether the token mint interval has elapsed and mintsCount is still below maxMintCount. Existing ground tokens are returned as strategy information, not a hard blocker.", parameters: obj({ role: ROLE }) },
    { name: "agentbox.skills.check_stabilize_prerequisites", description: "Check whether the role currently has unreliable AGC worth attempting to stabilize.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.summarize_role_state", description: "Summarize the current role state for dialogue planning.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.summarize_world_static_info", description: "Summarize lower-frequency world facts for dialogue planning.", parameters: obj({ role: ROLE }, ["role"]) },
    { name: "agentbox.skills.summarize_world_dynamic_info", description: "Summarize current nearby world dynamics for dialogue planning.", parameters: obj({ role: ROLE }, ["role"]) },
  ];
}

export class JSPlayerRuntime {
  constructor(pluginRoot, options = {}) {
    this.settings = loadSettings(pluginRoot, options.settings || {});
    this.pluginRoot = pluginRoot;
    this.client = new AgentboxClient(this.settings);
    this.signers = new SignerStore(this.settings);
    this.activeRoles = new ActiveRoleStore(this.settings);
    this.toolSpecs = buildToolSpecs();
    this.tools = new Map(this.toolSpecs.map((tool) => [tool.name, tool]));
  }

  listTools() {
    return this.toolSpecs.map((tool) => ({
      name: tool.name,
      label: tool.label || tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async invoke(toolName, payload = {}) {
    try {
      const tool = this.tools.get(toolName);
      if (!tool) return errorResult(toolName, precheckError("UNKNOWN_TOOL", `Unknown tool: ${toolName}`));
      const params = await this.normalizeToolPayload(tool, payload || {});
      this.validateToolPayload(tool, params);
      return await this.dispatch(toolName, params);
    } catch (error) {
      return errorResult(toolName, error);
    }
  }

  async normalizeToolPayload(tool, payload) {
    const params = { ...payload };
    const props = tool.parameters?.properties || {};
    if ("role" in props && !params.role) {
      const role = await this.resolveDefaultRole();
      if (role) params.role = role;
    }
    return params;
  }

  validateToolPayload(tool, payload) {
    for (const fieldName of tool.parameters?.required || []) {
      const value = payload[fieldName];
      if (value === null || value === undefined || value === "") {
        throw precheckError("MISSING_REQUIRED_FIELD", `Missing required field: ${fieldName}`, { field: fieldName, tool: tool.name });
      }
    }
  }

  async dispatch(toolName, payload) {
    switch (toolName) {
      case "agentbox.signer.prepare": return this.signerPrepare(payload.label, payload.force, payload.backupConfirmed, payload.confirmSignerReplacement);
      case "agentbox.signer.import": return this.signerImport(payload.privateKey, payload.label, payload.force, payload.backupConfirmed, payload.confirmSignerReplacement);
      case "agentbox.signer.export": return this.signerExport();
      case "agentbox.signer.read": return this.signerRead();
      case "agentbox.registration.confirm": return this.registrationConfirm(payload);
      case "agentbox.roles.list_owned": return this.listOwnedRoles();
      case "agentbox.roles.read_active": return this.readActiveRole();
      case "agentbox.roles.select_active": return this.selectActiveRole(payload);
      case "agentbox.roles.clear_active": return this.clearActiveRole();
      case "agentbox.skills.read_role_snapshot": return this.readRoleSnapshot(payload.role, payload.source);
      case "agentbox.skills.read_world_static_info": return this.readWorldStaticInfo(payload.role, payload.source);
      case "agentbox.skills.read_world_dynamic_info": return this.readWorldDynamicInfo(payload.role, payload.source);
      case "agentbox.skills.read_nearby_roles": return this.readNearbyRoles(payload.role, payload.source);
      case "agentbox.skills.read_nearby_lands": return this.readNearbyLands(payload.role, payload.source);
      case "agentbox.skills.read_land": return this.readLand(payload);
      case "agentbox.skills.read_last_mint": return this.readLastMint();
      case "agentbox.skills.read_lands_with_ground_tokens": return this.readLandsWithGroundTokens();
      case "agentbox.skills.read_global_config": return this.readGlobalConfig(payload.source);
      case "agentbox.skills.move.instant": return this.coreWrite(toolName, "moveTo", [payload.role, Number(payload.x), Number(payload.y)], "Instant movement transaction submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.teleport.start": return this.coreWrite(toolName, "startTeleport", [payload.role, Number(payload.x), Number(payload.y)], "Teleport started", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.finish_current_action": return this.finishCurrentAction(payload.role);
      case "agentbox.skills.gather.start": return this.coreWrite(toolName, "startGather", [payload.role, Number(payload.amount)], "Gathering started", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.learn.npc.start": return this.coreWrite(toolName, "startLearning", [payload.role, Number(payload.npcId)], "NPC learning started", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.learn.player.request": return this.coreWrite(toolName, "requestLearningFromPlayer", [payload.role, payload.teacherWallet, Number(payload.skillId)], "Player learning request submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]), targetWallet: payload.teacherWallet });
      case "agentbox.skills.learn.player.accept": return this.coreWrite(toolName, "acceptTeaching", [payload.role, payload.studentWallet], "Teaching acceptance submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]), targetWallet: payload.studentWallet });
      case "agentbox.skills.craft.start": return this.coreWrite(toolName, "startCrafting", [payload.role, Number(payload.recipeId)], "Crafting started", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.combat.attack": return this.coreWrite(toolName, "attack", [payload.role, payload.targetWallet], "Attack submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]), targetWallet: payload.targetWallet });
      case "agentbox.skills.equip.put_on": return this.coreWrite(toolName, "equip", [payload.role, Number(payload.equipmentId)], "Equip transaction submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.equip.take_off": return this.coreWrite(toolName, "unequip", [payload.role, Number(payload.slot)], "Unequip transaction submitted", { roleWallet: payload.role, allowedStates: new Set([ROLE_STATE_IDLE]) });
      case "agentbox.skills.land.buy": return this.coreWrite(toolName, "buyLand", [payload.role, Number(payload.x), Number(payload.y)], "Buy land transaction submitted", { roleWallet: payload.role, landXy: [Number(payload.x), Number(payload.y)] });
      case "agentbox.skills.land.set_contract": return this.coreWrite(toolName, "setLandContract", [payload.role, Number(payload.x), Number(payload.y), payload.contractAddress], "Set land contract transaction submitted", { roleWallet: payload.role, landXy: [Number(payload.x), Number(payload.y)] });
      case "agentbox.skills.social.dm": return this.coreWrite(toolName, "sendMessage", [payload.role, payload.toWallet, payload.message], "Direct message sent", { roleWallet: payload.role, targetWallet: payload.toWallet });
      case "agentbox.skills.social.global": return this.coreWrite(toolName, "sendGlobalMessage", [payload.role, payload.message], "Global message sent", { roleWallet: payload.role });
      case "agentbox.skills.cancel_current_action": return this.cancelCurrentAction(payload.role);
      case "agentbox.skills.trigger_mint": return this.economyWrite(toolName, "triggerMint", [], "Mint trigger submitted");
      case "agentbox.skills.stabilize_balance": return this.stabilizeBalance(payload.role);
      case "agentbox.skills.transfer_agc_to_owner": return this.transferAgcToOwner(payload.role, Number(payload.amount));
      case "agentbox.skills.check_finishable": return successResult(toolName, "Checked finishability of the current action", { data: await this.checkFinishable(payload.role) });
      case "agentbox.skills.check_gather_prerequisites": return successResult(toolName, "Checked gather prerequisites", { data: await this.checkGatherPrerequisites(payload.role, Number(payload.amount)) });
      case "agentbox.skills.check_learning_prerequisites": return successResult(toolName, "Checked learning prerequisites", { data: await this.checkLearningPrerequisites(payload.role, Number(payload.npcId)) });
      case "agentbox.skills.check_crafting_prerequisites": return successResult(toolName, "Checked crafting prerequisites", { data: await this.checkCraftingPrerequisites(payload.role, Number(payload.recipeId)) });
      case "agentbox.skills.check_trigger_mint_prerequisites": return successResult(toolName, "Checked trigger-mint prerequisites", { data: await this.checkTriggerMintPrerequisites(payload.role) });
      case "agentbox.skills.check_stabilize_prerequisites": return successResult(toolName, "Checked stabilize-balance prerequisites", { data: await this.checkStabilizePrerequisites(payload.role) });
      case "agentbox.skills.summarize_role_state": return successResult(toolName, "Summarized current role state", { data: await this.summarizeRoleState(payload.role) });
      case "agentbox.skills.summarize_world_static_info": return successResult(toolName, "Summarized world static info", { data: await this.summarizeWorldStaticInfo(payload.role) });
      case "agentbox.skills.summarize_world_dynamic_info": return successResult(toolName, "Summarized world dynamic info", { data: await this.summarizeWorldDynamicInfo(payload.role) });
      default:
        throw precheckError("UNKNOWN_TOOL", `Unknown tool: ${toolName}`);
    }
  }

  async resolveDefaultRole() {
    const activeRole = await this.requireValidatedActiveRole();
    return activeRole.roleWallet;
  }

  requireActiveSigner() {
    const { record, wallet } = this.signers.loadActiveWallet(this.client.provider);
    if (!record || !wallet) throw precheckError("MISSING_SIGNER", "A local signer is required for this action");
    return { record, wallet };
  }

  async ownedRolesForActiveSigner() {
    const { wallet } = this.requireActiveSigner();
    const ownedRoles = await this.client.listOwnedRoles(wallet.address);
    return {
      ownerAddress: wallet.address,
      ownedRoles,
    };
  }

  async buildOwnedRolesPayload() {
    const { ownerAddress, ownedRoles } = await this.ownedRolesForActiveSigner();
    const activeRoleRecord = this.activeRoles.loadRecord();
    const activeRoleWallet = activeRoleRecord?.roleWallet?.toLowerCase() || null;
    return {
      ownerAddress,
      activeRole: activeRoleRecord,
      ownedRolesCount: ownedRoles.length,
      ownedRoles: ownedRoles.map((item) => ({
        ...item,
        isActive: Boolean(activeRoleWallet && item.roleWallet.toLowerCase() === activeRoleWallet),
      })),
    };
  }

  async requireValidatedActiveRole() {
    const record = this.activeRoles.loadRecord();
    if (!record?.roleWallet) {
      throw precheckError("MISSING_ACTIVE_ROLE", "No active role is selected. Use agentbox.roles.list_owned and agentbox.roles.select_active first");
    }
    const { ownerAddress, ownedRoles } = await this.ownedRolesForActiveSigner();
    const ownedRole = ownedRoles.find((item) => item.roleWallet.toLowerCase() === record.roleWallet.toLowerCase());
    if (!ownedRole) {
      throw precheckError("ACTIVE_ROLE_NOT_OWNED", "The stored active role is not owned by the current active signer", {
        activeRole: record,
        ownerAddress,
      });
    }
    const normalized = {
      roleId: ownedRole.roleId,
      roleWallet: ownedRole.roleWallet,
      ownerAddress,
      updated_at: record.updated_at,
    };
    if (record.roleId !== normalized.roleId || record.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase() || record.roleWallet !== normalized.roleWallet) {
      this.activeRoles.setActiveRole(normalized);
      return this.activeRoles.loadRecord();
    }
    return normalized;
  }

  async maybeReadActiveRole() {
    const record = this.activeRoles.loadRecord();
    if (!record) {
      return {
        hasActiveRole: false,
        activeRole: null,
        isOwnedByActiveSigner: false,
      };
    }
    try {
      const validated = await this.requireValidatedActiveRole();
      return {
        hasActiveRole: true,
        activeRole: validated,
        isOwnedByActiveSigner: true,
      };
    } catch (error) {
      const { wallet } = this.requireActiveSigner();
      return {
        hasActiveRole: true,
        activeRole: record,
        isOwnedByActiveSigner: false,
        ownerAddress: wallet.address,
        warning: {
          errorCode: error.errorCode || "PRECHECK_ACTIVE_ROLE_INVALID",
          errorMessage: error.message || String(error),
        },
      };
    }
  }

  async signerPayload() {
    const { record } = this.signers.loadActiveWallet(this.client.provider);
    if (!record) return { hasSigner: false, signer: null };
    const balance = await this.client.getBalance(record.address);
    const ownedRoles = await this.client.listOwnedRoles(record.address);
    const activeRoleState = await this.maybeReadActiveRole();
    return {
      hasSigner: true,
      signer: {
        signerId: record.signer_id,
        address: record.address,
        label: record.label,
        balanceEth: this.client.formatEth(balance),
        hasPrivateKey: true,
      },
      ownedRolesCount: ownedRoles.length,
      activeRole: activeRoleState.activeRole,
      hasActiveRole: activeRoleState.hasActiveRole,
      activeRoleOwnedBySigner: activeRoleState.isOwnedByActiveSigner,
    };
  }

  ensureSignerOverwriteAllowed(force, backupConfirmed = false, confirmSignerReplacement = false, nextAddress = null) {
    const existing = this.signers.loadRecord();
    if (!existing) return null;
    const sameAddress = nextAddress && existing.address.toLowerCase() === nextAddress.toLowerCase();
    if (!force && !sameAddress) {
      throw precheckError("SIGNER_ALREADY_EXISTS", "A local signer already exists. Reuse it for new account registration. Before replacing it, export and back up the private key, warn the user, and only proceed with force=true after explicit confirmation", {
        existingSigner: {
          signerId: existing.signer_id,
          address: existing.address,
          label: existing.label,
        },
      });
    }
    if (force && !sameAddress && (!backupConfirmed || !confirmSignerReplacement)) {
      throw precheckError("SIGNER_REPLACEMENT_NOT_CONFIRMED", "Replacing the local signer requires a backup reminder and explicit user confirmation. Export the current private key first, confirm the user has backed it up, and then retry with backupConfirmed=true and confirmSignerReplacement=true", {
        existingSigner: {
          signerId: existing.signer_id,
          address: existing.address,
          label: existing.label,
        },
      });
    }
    return existing;
  }

  signerPrepare(label, force = false, backupConfirmed = false, confirmSignerReplacement = false) {
    const previous = this.ensureSignerOverwriteAllowed(force, backupConfirmed, confirmSignerReplacement);
    const record = this.signers.createSigner(label);
    if (!previous || previous.address.toLowerCase() !== record.address.toLowerCase()) this.activeRoles.clear();
    return successResult("agentbox.signer.prepare", "Local signer created", {
      data: { signerId: record.signer_id, address: record.address, label: record.label },
    });
  }

  signerImport(privateKey, label, force = false, backupConfirmed = false, confirmSignerReplacement = false) {
    const importedWallet = new ethers.Wallet(privateKey);
    const previous = this.ensureSignerOverwriteAllowed(force, backupConfirmed, confirmSignerReplacement, importedWallet.address);
    const record = this.signers.importSigner(privateKey, label);
    if (!previous || previous.address.toLowerCase() !== record.address.toLowerCase()) this.activeRoles.clear();
    return successResult("agentbox.signer.import", "Local signer imported", {
      data: { signerId: record.signer_id, address: record.address, label: record.label },
    });
  }

  signerExport() {
    const record = this.signers.exportSigner();
    return successResult("agentbox.signer.export", "Local signer private key exported", {
      data: {
        signerId: record.signer_id,
        address: record.address,
        label: record.label,
        privateKey: record.private_key,
      },
    });
  }

  async signerRead() {
    return successResult("agentbox.signer.read", "Loaded signer state", { data: await this.signerPayload() });
  }

  async listOwnedRoles() {
    return successResult("agentbox.roles.list_owned", "Listed all roles owned by the active signer", {
      data: await this.buildOwnedRolesPayload(),
    });
  }

  async readActiveRole() {
    const owned = await this.buildOwnedRolesPayload();
    const activeRoleState = await this.maybeReadActiveRole();
    return successResult("agentbox.roles.read_active", "Read active role state", {
      data: {
        ownerAddress: owned.ownerAddress,
        ownedRolesCount: owned.ownedRolesCount,
        hasActiveRole: activeRoleState.hasActiveRole,
        activeRole: activeRoleState.activeRole,
        isOwnedByActiveSigner: activeRoleState.isOwnedByActiveSigner,
        warning: activeRoleState.warning || null,
      },
    });
  }

  async selectActiveRole({ roleWallet, roleId }) {
    if (!roleWallet && roleId == null) {
      throw precheckError("MISSING_ROLE_SELECTION", "Provide roleWallet or roleId to select the active role");
    }
    const { ownerAddress, ownedRoles } = await this.ownedRolesForActiveSigner();
    const selected = ownedRoles.find((item) => {
      if (roleWallet && item.roleWallet.toLowerCase() === roleWallet.toLowerCase()) return true;
      if (roleId != null && item.roleId === Number(roleId)) return true;
      return false;
    });
    if (!selected) {
      throw precheckError("ROLE_NOT_OWNED", "The requested role is not owned by the active signer", {
        ownerAddress,
        requestedRoleWallet: roleWallet || null,
        requestedRoleId: roleId ?? null,
      });
    }
    const activeRole = this.activeRoles.setActiveRole({
      roleId: selected.roleId,
      roleWallet: selected.roleWallet,
      ownerAddress,
    });
    return successResult("agentbox.roles.select_active", "Selected active role", {
      data: {
        ownerAddress,
        activeRole,
        ownedRolesCount: ownedRoles.length,
      },
    });
  }

  clearActiveRole() {
    this.activeRoles.clear();
    return successResult("agentbox.roles.clear_active", "Cleared active role", {
      data: {
        activeRole: null,
        hasActiveRole: false,
      },
    });
  }

  async selectReadSource(requestedSource, { indexerSupported }) {
    const source = requestedSource || "auto";
    if (!["auto", "chain", "indexer"].includes(source)) throw precheckError("INVALID_READ_SOURCE", "source must be auto, chain, or indexer");
    if (source === "chain") return "chain";
    if (source === "indexer") {
      if (!this.client.indexer) throw precheckError("INDEXER_NOT_CONFIGURED", "INDEXER_BASE_URL is required for indexer reads");
      if (!indexerSupported) throw precheckError("INDEXER_UNSUPPORTED", "This read does not have an indexer-backed implementation");
      return "indexer";
    }
    return indexerSupported ? "indexer" : "chain";
  }

  async readMeFromIndexer(roleWallet) {
    const payload = await this.client.indexer.getRoleByWallet(roleWallet);
    const position = payload.position || {};
    const stats = payload.stats || {};
    const action = payload.action || {};
    const balance = payload.balance || {};
    return {
      identity: this.annotateRoleIdentity({
        isValidRole: payload.is_valid_role_wallet,
        roleId: payload.role_id,
        owner: payload.owner_address,
        controller: payload.controller_address,
      }),
      role: this.annotateRoleState({
        exists: payload.exists,
        state: payload.state,
        x: position.x ?? 0,
        y: position.y ?? 0,
        speed: stats.speed ?? 0,
        attack: stats.attack ?? 0,
        defense: stats.defense ?? 0,
        hp: stats.hp ?? 0,
        maxHp: stats.max_hp ?? 0,
        range: stats.range ?? 0,
        mp: stats.mp ?? 0,
      }),
      action: this.annotateActionState({
        craftingStartBlock: action.crafting_start_block ?? 0,
        craftingRequiredBlocks: action.crafting_required_blocks ?? 0,
        craftingRecipeId: action.crafting_recipe_id ?? 0,
        learningStartBlock: action.learning_start_block ?? 0,
        learningRequiredBlocks: action.learning_required_blocks ?? 0,
        learningTargetId: action.learning_target_id ?? 0,
        learningSkillId: action.learning_skill_id ?? 0,
        learningIsNPC: action.learning_is_npc ?? false,
        learningTeacherWallet: action.learning_teacher_wallet ?? ZERO_ADDRESS,
        teachingStartBlock: action.teaching_start_block ?? 0,
        teachingRequiredBlocks: action.teaching_required_blocks ?? 0,
        teachingSkillId: action.teaching_skill_id ?? 0,
        teachingStudentWallet: action.teaching_student_wallet ?? ZERO_ADDRESS,
        teleportStartBlock: action.teleport_start_block ?? 0,
        teleportRequiredBlocks: action.teleport_required_blocks ?? 0,
        teleportTargetX: action.teleport_target_x ?? 0,
        teleportTargetY: action.teleport_target_y ?? 0,
        gatheringStartBlock: action.gathering_start_block ?? 0,
        gatheringRequiredBlocks: action.gathering_required_blocks ?? 0,
        gatheringTargetLandId: action.gathering_target_land_id ?? 0,
        gatheringAmount: action.gathering_amount ?? 0,
      }),
      balances: {
        totalBalance: balance.agc_balance ?? 0,
        unreliableBalance: balance.unreliable_agc_balance ?? 0,
        reliableBalance: balance.reliable_agc_balance ?? 0,
      },
      equipped: this.annotateEquipped((payload.equipments || []).filter((item) => Number(item.equipment_id || 0) > 0).map((item) => ({
        slot: Number(item.slot || 0),
        equipmentId: Number(item.equipment_id || 0),
        updatedAtBlock: item.updated_at_block,
      }))),
      resourceBalances: this.annotateResourceBalances((payload.resource_balances || []).filter((item) => Number(item.amount || 0) > 0).map((item) => ({
        tokenId: Number(item.token_id || 0),
        amount: Number(item.amount || 0),
        updatedAtBlock: item.updated_at_block,
      }))),
      ownedUnequippedEquipments: this.annotateOwnedEquipments((payload.owned_unequipped_equipments || []).filter((item) => Number(item.amount || 0) > 0).map((item) => ({
        equipmentId: Number(item.equipment_id || 0),
        amount: Number(item.amount || 0),
        slot: Number(item.slot || 0),
        updatedAtBlock: item.updated_at_block,
      }))),
      skills: this.annotateSkills((payload.skills || []).map((item) => ({
        skillId: Number(item.skill_id || 0),
        learned: Boolean(item.learned),
        updatedAtBlock: item.updated_at_block,
      }))),
    };
  }

  async readMe(roleWallet, source = "auto") {
    const selected = await this.selectReadSource(source, { indexerSupported: true });
    let data = null;
    if (selected === "indexer") {
      try {
        data = await this.readMeFromIndexer(roleWallet);
      } catch (error) {
        if (source === "indexer") throw error;
      }
    }
    if (!data) {
      const identity = await this.client.getRoleIdentity(roleWallet);
      const role = await this.client.getRoleSnapshot(roleWallet);
      const action = await this.client.getRoleActionSnapshot(roleWallet);
      const balances = await this.client.getEconomyBalances(roleWallet);
      const equipped = await this.client.getEquippedBatch(roleWallet, DEFAULT_ROLE_EQUIPMENT_SLOTS);
      const resourceBalances = await this.client.getResourceBalances(roleWallet, DEFAULT_ROLE_RESOURCE_TOKEN_IDS);
      const skills = await this.client.getRoleSkills(roleWallet, [1, 2, 3, 4, 5, 6, 7, 8]);
      data = {
        identity: this.annotateRoleIdentity(identity),
        role: this.annotateRoleState(role),
        action: this.annotateActionState(action),
        balances,
        equipped: this.annotateEquipped(DEFAULT_ROLE_EQUIPMENT_SLOTS.map((slot, index) => ({ slot, equipmentId: Number(equipped[index] || 0) })).filter((item) => item.equipmentId > 0)),
        resourceBalances: this.annotateResourceBalances(DEFAULT_ROLE_RESOURCE_TOKEN_IDS.map((tokenId, index) => ({ tokenId, amount: Number(resourceBalances[index] || 0) })).filter((item) => item.amount > 0)),
        ownedUnequippedEquipments: [],
        skills: this.annotateSkills([1, 2, 3, 4, 5, 6, 7, 8].map((skillId, index) => ({ skillId, learned: Boolean(skills[index]) }))),
      };
    }
    return successResult("agentbox.read.me", "Loaded role identity, snapshot, action state, balances, and owned role assets", { data });
  }

  async readGlobalConfig(source = "auto") {
    const selected = await this.selectReadSource(source, { indexerSupported: true });
    let data = null;
    if (selected === "indexer") {
      try {
        const payload = await this.client.indexer.getGlobalConfig();
        const item = payload.item || {};
        data = {
          mapWidth: item.map_width,
          mapHeight: item.map_height,
          mintIntervalBlocks: item.mint_interval_blocks,
          mintAmount: item.mint_amount,
          stabilizationBlocks: item.stabilization_blocks,
          craftDurationBlocks: item.craft_duration_blocks,
          halvingIntervalBlocks: item.halving_interval_blocks,
          landPrice: item.land_price,
        };
      } catch (error) {
        if (source === "indexer") throw error;
      }
    }
    if (!data) data = await this.client.getGlobalConfig();
    return successResult("agentbox.read.global_config", "Loaded global configuration", { data });
  }

  async readLand(payload, source = "auto") {
    const selected = await this.selectReadSource(source, { indexerSupported: true });
    let mapWidth = null;
    let data = null;
    try {
      const config = (await this.readGlobalConfig(selected)).data;
      mapWidth = toFiniteNumber(config?.mapWidth);
    } catch {}
    if (selected === "indexer") {
      try {
        if (payload.landId !== undefined && payload.landId !== null) {
          const item = await this.client.indexer.getLandById(payload.landId);
          data = this.attachLandCoordinateInfo({
            landId: item.land_id,
            x: item.x,
            y: item.y,
            owner: item.owner_address,
            landContractAddress: item.land_contract_address,
            isResourcePoint: item.is_resource_point,
            resourceType: item.resource_type,
            groundTokens: item.ground_tokens,
          });
        } else if (payload.x !== undefined && payload.y !== undefined) {
          const result = await this.client.indexer.getLandByCoordinate(payload.x, payload.y);
          const item = (result.items || [])[0];
          if (!item) throw precheckError("LAND_NOT_FOUND", "Land was not found");
          data = this.attachLandCoordinateInfo({
            landId: item.land_id,
            x: item.x,
            y: item.y,
            owner: item.owner_address,
            landContractAddress: item.land_contract_address,
            isResourcePoint: item.is_resource_point,
            resourceType: item.resource_type,
            groundTokens: item.ground_tokens,
          });
        }
      } catch (error) {
        if (source === "indexer") throw error;
      }
    }
    if (!data) data = this.attachLandCoordinateInfo(await this.client.getLand(payload));
    return successResult("agentbox.read.land", "Loaded land snapshot", {
      data: {
        coordinate_convention: buildCoordinateConvention(mapWidth),
        ...data,
      },
    });
  }

  async readActionFinishable(roleWallet) {
    const finishable = await this.client.canFinishCurrentAction(roleWallet);
    return successResult("agentbox.read.action.finishable", "Loaded current action completion status", {
      data: {
        ...finishable,
        stateName: roleStateNameFromValue(finishable.state),
      },
    });
  }

  async buildRoleSnapshot(roleWallet, source = "auto") {
    const me = (await this.readMe(roleWallet, source)).data;
    const finishable = (await this.readActionFinishable(roleWallet)).data;
    return {
      role: roleWallet,
      staticInfo: {
        identity: me.identity || {},
        skills: [...(me.skills || [])],
        equipped: [...(me.equipped || [])],
        ownedUnequippedEquipments: [...(me.ownedUnequippedEquipments || [])],
      },
      dynamicInfo: {
        role: me.role || {},
        action: me.action || {},
        balances: me.balances || {},
        resourceBalances: [...(me.resourceBalances || [])],
        finishable,
      },
    };
  }

  normalizeLandItem(item) {
    return this.attachLandCoordinateInfo({
      landId: item.land_id,
      x: item.x,
      y: item.y,
      ownerAddress: item.owner_address,
      landContractAddress: item.land_contract_address,
      isResourcePoint: item.is_resource_point,
      resourceType: item.resource_type,
      groundTokens: item.ground_tokens,
      updatedAtBlock: item.updated_at_block,
    });
  }

  attachLandCoordinateInfo(item) {
    if (!item || typeof item !== "object") return item;
    const x = item.x;
    const y = item.y;
    const resourceType = Number(item.resourceType ?? item.resource_type ?? 0);
    return {
      ...item,
      ...(resourceType > 0 ? { resourceTypeName: resourceNameFromId(resourceType) } : {}),
      coordinate: x !== undefined && y !== undefined ? { x, y } : null,
      coordinateLabel: x !== undefined && y !== undefined ? `(${x}, ${y})` : null,
    };
  }

  annotateRoleIdentity(identity = {}) {
    return {
      ...identity,
      roleLabel: identity?.roleId != null ? `Role #${identity.roleId}` : "unknown_role",
    };
  }

  annotateRoleState(role = {}) {
    return {
      ...role,
      stateName: roleStateNameFromValue(role.state),
    };
  }

  annotateActionState(action = {}) {
    return {
      ...action,
      ...(Number(action.craftingRecipeId || 0) > 0 ? {
        craftingRecipeName: recipeNameFromId(action.craftingRecipeId),
      } : {}),
      ...(Number(action.learningTargetId || 0) > 0 && action.learningIsNPC ? {
        learningNpcName: npcNameFromId(action.learningTargetId),
      } : {}),
      ...(Number(action.learningSkillId || 0) > 0 ? {
        learningSkillName: skillNameFromId(action.learningSkillId),
      } : {}),
      ...(Number(action.teachingSkillId || 0) > 0 ? {
        teachingSkillName: skillNameFromId(action.teachingSkillId),
      } : {}),
    };
  }

  annotateResourceBalances(items = []) {
    return items.map((item) => ({
      ...item,
      resourceName: resourceNameFromId(item.tokenId),
    }));
  }

  annotateSkills(items = []) {
    return items.map((item) => ({
      ...item,
      skillName: skillNameFromId(item.skillId),
    }));
  }

  annotateEquipped(items = []) {
    return items.map((item) => ({
      ...item,
      slotName: slotNameFromId(item.slot),
      equipmentName: equipmentNameFromId(item.equipmentId),
    }));
  }

  annotateOwnedEquipments(items = []) {
    return items.map((item) => ({
      ...item,
      slotName: slotNameFromId(item.slot),
      equipmentName: equipmentNameFromId(item.equipmentId),
    }));
  }

  annotateNpc(item = {}) {
    const npcId = Number(item.npcId || 0);
    const skillId = Number(item.skillId || 0);
    return {
      ...item,
      ...(npcId > 0 ? { npcName: npcNameFromId(npcId) } : {}),
      ...(skillId > 0 ? { taughtSkillName: skillNameFromId(skillId) } : {}),
    };
  }

  annotateRecipe(item = {}) {
    const requiredResources = [...(item.requiredResources || [])];
    const requiredSkill = Number(item.requiredSkill || 0);
    const outputEquipmentId = Number(item.outputEquipmentId || 0);
    return {
      ...item,
      ...(Number(item.recipeId || 0) > 0 ? { recipeName: recipeNameFromId(item.recipeId) } : {}),
      requiredResourceNames: requiredResources.map((tokenId) => resourceNameFromId(tokenId)),
      ...(requiredSkill > 0 ? { requiredSkillName: skillNameFromId(requiredSkill) } : {}),
      ...(outputEquipmentId > 0 ? { outputEquipmentName: equipmentNameFromId(outputEquipmentId) } : {}),
    };
  }

  annotateEquipment(item = {}) {
    const equipmentId = Number(item.equipmentId || 0);
    const slot = Number(item.slot || 0);
    return {
      ...item,
      ...(equipmentId > 0 ? { equipmentName: equipmentNameFromId(equipmentId) } : {}),
      ...(slot > 0 ? { slotName: slotNameFromId(slot) } : {}),
    };
  }

  annotateNearbyRole(item = {}) {
    return {
      ...item,
      stateName: roleStateNameFromValue(item.state),
      roleLabel: item?.roleId != null ? `Role #${item.roleId}` : "unknown_role",
    };
  }

  decodeLandIdToCoordinate(landId, mapWidth) {
    const numericLandId = toFiniteNumber(landId);
    const numericMapWidth = toFiniteNumber(mapWidth);
    if (numericLandId === null || numericMapWidth === null || numericMapWidth <= 0) return null;
    const y = Math.floor(numericLandId / numericMapWidth);
    const x = numericLandId % numericMapWidth;
    return { x, y, coordinateLabel: `(${x}, ${y})` };
  }

  attachLastMintCoordinateInfo(lastMint, mapWidth) {
    if (!lastMint || typeof lastMint !== "object") return lastMint;
    const decodedLandCoordinate = this.decodeLandIdToCoordinate(lastMint?.decoded_args?.landId, mapWidth);
    if (!decodedLandCoordinate) return lastMint;
    return {
      ...lastMint,
      decoded_land_coordinate: decodedLandCoordinate,
    };
  }

  async listLands(query) {
    const items = [];
    let offset = 0;
    while (true) {
      const payload = await this.client.indexer.listLands({ ...query, limit: PAGE_SIZE, offset });
      const pageItems = payload.items || [];
      if (!pageItems.length) break;
      items.push(...pageItems.map((item) => this.normalizeLandItem(item)));
      if (pageItems.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return items;
  }

  async buildWorldInfo(roleWallet, source = "auto") {
    const selected = await this.selectReadSource(source, { indexerSupported: true });
    const me = (await this.readMe(roleWallet, selected)).data;
    const role = me.role || {};
    let mapWidth = null;
    const worldState = {
      coordinate_convention: buildCoordinateConvention(),
      available_land_contracts: [],
      current_equipment: [],
      current_equipment_recipes: {},
      current_block: null,
      current_land: null,
      nearby_roles: [],
      nearby_lands: [],
      lands_with_ground_tokens: [],
      last_mint: null,
      all_npcs: [],
      recipe_catalog: [],
      equipment_catalog: {},
      all_resource_lands: [],
      mint_interval_blocks: null,
      max_mint_count: null,
    };
    try {
      const config = (await this.readGlobalConfig(selected)).data;
      worldState.mint_interval_blocks = config.mintIntervalBlocks;
      worldState.max_mint_count = config.maxMintCount;
      mapWidth = toFiniteNumber(config?.mapWidth);
      worldState.coordinate_convention = buildCoordinateConvention(mapWidth);
    } catch {}
    try {
      worldState.current_block = Number(await this.client.provider.getBlockNumber());
    } catch {}
    if (selected !== "chain") {
      try {
        const items = (await this.client.indexer.listNpcConfigs()).items || [];
        worldState.all_npcs = items.map((item) => this.annotateNpc({
          npcId: Number(item.npc_id || 0),
          x: item.x,
          y: item.y,
          skillId: Number(item.skill_id || 0),
          isTeaching: Boolean(item.is_teaching),
          studentWallet: item.student_wallet,
          startBlock: item.start_block,
        }));
      } catch {}
      try {
        const items = (await this.client.indexer.listRecipeConfigs()).items || [];
        worldState.recipe_catalog = items.map((item) => this.annotateRecipe({
          recipeId: Number(item.recipe_id || 0),
          requiredResources: [...(item.resource_types || [])],
          requiredAmounts: [...(item.amounts || [])],
          requiredSkill: Number(item.skill_id || 0),
          requiredBlocks: item.required_blocks,
          outputEquipmentId: Number(item.output_equipment_id || 0),
          updatedAtBlock: item.updated_at_block,
        }));
      } catch {}
      try {
        const items = (await this.client.indexer.listEquipmentConfigs()).items || [];
        worldState.equipment_catalog = Object.fromEntries(items.filter((item) => Number(item.equipment_id || 0) > 0).map((item) => [
          Number(item.equipment_id || 0),
          this.annotateEquipment({
            equipmentId: Number(item.equipment_id || 0),
            slot: Number(item.slot || 0),
            speedBonus: item.speed_bonus,
            attackBonus: item.attack_bonus,
            defenseBonus: item.defense_bonus,
            maxHpBonus: item.max_hp_bonus,
            rangeBonus: item.range_bonus,
            updatedAtBlock: item.updated_at_block,
          }),
        ]));
      } catch {}
      try {
        worldState.all_resource_lands = await this.listLands({ is_resource_point: true });
      } catch {}
    }
    worldState.current_equipment = this.annotateEquipped((me.equipped || []).filter((item) => Number(item.equipmentId || item.equipment_id || 0) > 0).map((item) => ({
      slot: Number(item.slot || 0),
      equipmentId: Number(item.equipmentId || item.equipment_id || 0),
      attributes: worldState.equipment_catalog[Number(item.equipmentId || item.equipment_id || 0)] || {},
    })));
    const recipeByOutput = {};
    for (const recipe of worldState.recipe_catalog) {
      const outputId = Number(recipe.outputEquipmentId || 0);
      if (outputId > 0) (recipeByOutput[outputId] ||= []).push(recipe);
    }
    worldState.current_equipment_recipes = Object.fromEntries(worldState.current_equipment.map((item) => [String(item.equipmentId), recipeByOutput[item.equipmentId] || []]));
    if (selected !== "chain") {
      try { worldState.last_mint = this.attachLastMintCoordinateInfo((await this.client.indexer.getLastMint()).item || null, mapWidth); } catch {}
      try { worldState.lands_with_ground_tokens = await this.listLands({ has_ground_tokens: true }); } catch {}
    }
    if (role.x !== undefined && role.y !== undefined) {
      try {
        const currentLandData = (await this.readLand({ x: Number(role.x), y: Number(role.y) }, selected)).data || {};
        const { coordinate_convention: _coordinateConvention, ...currentLand } = currentLandData;
        worldState.current_land = currentLand;
      } catch {}
      if (selected !== "chain") {
        const bounds = {
          x_min: Number(role.x) - 100,
          x_max: Number(role.x) + 100,
          y_min: Number(role.y) - 100,
          y_max: Number(role.y) + 100,
          limit: 200,
          offset: 0,
        };
        try {
          const items = (await this.client.indexer.listRoles(bounds)).items || [];
          worldState.nearby_roles = items.filter((item) => String(item.role_wallet || "").toLowerCase() !== String(roleWallet).toLowerCase()).map((item) => ({
            roleId: item.role_id,
            roleWallet: item.role_wallet,
            ownerAddress: item.owner_address,
            controllerAddress: item.controller_address,
            x: (item.position || {}).x,
            y: (item.position || {}).y,
            state: item.state,
          })).map((item) => this.annotateNearbyRole(item));
        } catch {}
        try {
          const items = (await this.client.indexer.listLands(bounds)).items || [];
          worldState.nearby_lands = items.map((item) => this.normalizeLandItem(item));
        } catch {}
      }
    }
    return {
      staticInfo: {
        coordinate_convention: worldState.coordinate_convention,
        all_npcs: worldState.all_npcs,
        recipe_catalog: worldState.recipe_catalog,
        equipment_catalog: worldState.equipment_catalog,
        all_resource_lands: worldState.all_resource_lands,
        current_equipment: worldState.current_equipment,
        current_equipment_recipes: worldState.current_equipment_recipes,
        available_land_contracts: [],
        mint_interval_blocks: worldState.mint_interval_blocks,
        max_mint_count: worldState.max_mint_count,
      },
      dynamicInfo: {
        coordinate_convention: worldState.coordinate_convention,
        current_block: worldState.current_block,
        current_land: worldState.current_land,
        nearby_roles: worldState.nearby_roles,
        nearby_lands: worldState.nearby_lands,
        lands_with_ground_tokens: worldState.lands_with_ground_tokens,
        last_mint: worldState.last_mint,
      },
    };
  }

  async readRoleSnapshot(roleWallet, source = "auto") {
    return successResult("agentbox.skills.read_role_snapshot", "Loaded role snapshot grouped into staticInfo and dynamicInfo", {
      data: await this.buildRoleSnapshot(roleWallet, source),
    });
  }

  async readWorldStaticInfo(roleWallet, source = "auto") {
    const payload = await this.buildWorldInfo(roleWallet, source);
    return successResult("agentbox.skills.read_world_static_info", "Loaded world static info", { data: payload.staticInfo || {} });
  }

  async readWorldDynamicInfo(roleWallet, source = "auto") {
    const payload = await this.buildWorldInfo(roleWallet, source);
    return successResult("agentbox.skills.read_world_dynamic_info", "Loaded world dynamic info", { data: payload.dynamicInfo || {} });
  }

  async readNearbyRoles(roleWallet, source = "auto") {
    const payload = await this.buildWorldInfo(roleWallet, source);
    return successResult("agentbox.skills.read_nearby_roles", "Loaded nearby roles", { data: { items: payload.dynamicInfo?.nearby_roles || [] } });
  }

  async readNearbyLands(roleWallet, source = "auto") {
    const payload = await this.buildWorldInfo(roleWallet, source);
    return successResult("agentbox.skills.read_nearby_lands", "Loaded nearby lands", {
      data: {
        coordinate_convention: payload.dynamicInfo?.coordinate_convention || buildCoordinateConvention(),
        items: payload.dynamicInfo?.nearby_lands || [],
      },
    });
  }

  async readLastMint() {
    const payload = await this.client.indexer.getLastMint();
    let mapWidth = null;
    try {
      const config = (await this.readGlobalConfig("auto")).data;
      mapWidth = toFiniteNumber(config?.mapWidth);
    } catch {}
    return successResult("agentbox.skills.read_last_mint", "Loaded last mint event from the indexer", {
      data: this.attachLastMintCoordinateInfo(payload.item, mapWidth),
    });
  }

  async readLandsWithGroundTokens() {
    let mapWidth = null;
    try {
      const config = (await this.readGlobalConfig("auto")).data;
      mapWidth = toFiniteNumber(config?.mapWidth);
    } catch {}
    return successResult("agentbox.skills.read_lands_with_ground_tokens", "Loaded lands with ground tokens from the indexer", {
      data: {
        coordinate_convention: buildCoordinateConvention(mapWidth),
        items: await this.listLands({ has_ground_tokens: true }),
      },
    });
  }

  async validateRoleWallet(roleWallet) {
    if (!ethers.isAddress(roleWallet)) throw precheckError("INVALID_ADDRESS", "role is not a valid address", { field: "role" });
    const identity = await this.client.getRoleIdentity(roleWallet);
    if (!identity.isValidRole) throw precheckError("INVALID_ROLE", "role is not a registered in-game entity");
    return identity;
  }

  async validateOwnerOrController(roleWallet, signerAddress) {
    const identity = await this.validateRoleWallet(roleWallet);
    const signer = ethers.getAddress(signerAddress);
    const owner = ethers.getAddress(identity.owner);
    const controller = identity.controller && identity.controller !== ZERO_ADDRESS ? ethers.getAddress(identity.controller) : ZERO_ADDRESS;
    if (controller !== ZERO_ADDRESS) {
      if (signer !== controller) {
        throw precheckError("NOT_ROLE_CONTROLLER", "Signer is not the controller of the role", { roleId: identity.roleId, owner, controller });
      }
    } else if (signer !== owner) {
      throw precheckError("NOT_ROLE_OWNER", "Signer is not the owner of the role", { roleId: identity.roleId, owner, controller });
    }
    return { roleId: identity.roleId, owner, controller };
  }

  async validateRoleState(roleWallet, allowedStates) {
    const snapshot = await this.client.getRoleSnapshot(roleWallet);
    const state = normalizeRoleState(snapshot.state);
    if (!allowedStates.has(state)) throw precheckError("ROLE_STATE_INVALID", "Role state does not allow this action", { state, allowedStates: [...allowedStates].sort() });
    return snapshot;
  }

  async validateFinishBlockReady(roleWallet) {
    const finishable = await this.client.canFinishCurrentAction(roleWallet);
    if (!finishable.canFinish) throw precheckError("ACTION_NOT_FINISHABLE", "Current action cannot be finished yet", { state: finishable.state, finishBlock: finishable.finishBlock });
    return { state: finishable.state, finishBlock: finishable.finishBlock };
  }

  async validateTargetExists(targetWallet) {
    if (!ethers.isAddress(targetWallet)) throw precheckError("INVALID_ADDRESS", "targetWallet is not a valid address", { field: "targetWallet" });
    const [valid, x, y] = await this.client.getEntityPosition(targetWallet);
    if (!valid) throw precheckError("INVALID_TARGET", "Target entity does not exist", { targetWallet });
    return { targetWallet, x, y };
  }

  async validateLandConstraints(roleWallet, x, y) {
    const snapshot = await this.client.getRoleSnapshot(roleWallet);
    if (Number(snapshot.x) !== x || Number(snapshot.y) !== y) {
      throw precheckError("ROLE_NOT_ON_LAND", "Role must stand on the target land coordinate", { roleX: snapshot.x, roleY: snapshot.y, x, y });
    }
    return snapshot;
  }

  async coreWrite(action, method, args, summary, { roleWallet, allowedStates, finishable = false, targetWallet, landXy } = {}) {
    const { wallet } = this.requireActiveSigner();
    const data = {};
    if (roleWallet) {
      Object.assign(data, await this.validateOwnerOrController(roleWallet, wallet.address));
      if (allowedStates) data.roleSnapshot = await this.validateRoleState(roleWallet, allowedStates);
    }
    if (finishable && roleWallet) data.finishable = await this.validateFinishBlockReady(roleWallet);
    if (targetWallet) data.target = await this.validateTargetExists(targetWallet);
    if (landXy && roleWallet) await this.validateLandConstraints(roleWallet, landXy[0], landXy[1]);
    const tx = await this.client.sendTransaction(this.client.core, method, args, wallet);
    return successResult(action, summary, { data, txHash: tx.txHash, chainId: this.settings.chainId, blockNumber: tx.blockNumber });
  }

  async economyWrite(action, method, args, summary, { roleWallet } = {}) {
    const { wallet } = this.requireActiveSigner();
    const data = {};
    if (roleWallet) Object.assign(data, await this.validateOwnerOrController(roleWallet, wallet.address));
    const tx = await this.client.sendTransaction(this.client.economy, method, args, wallet);
    return successResult(action, summary, { data, txHash: tx.txHash, chainId: this.settings.chainId, blockNumber: tx.blockNumber });
  }

  async finishCurrentAction(roleWallet) {
    const chainMe = (await this.readMe(roleWallet, "chain")).data;
    const chainRoleState = normalizeRoleState(chainMe.role?.state);
    const finishable = await this.client.canFinishCurrentAction(roleWallet);
    const state = normalizeRoleState(finishable.state);

    if (chainRoleState !== state) {
      throw precheckError("CHAIN_STATE_CHANGED", "Chain role state no longer matches the finishable state", {
        chainRoleState,
        finishableState: state,
        finishBlock: finishable.finishBlock,
      });
    }

    if (!finishable.canFinish) {
      throw precheckError("ACTION_NOT_FINISHABLE", "Current action cannot be finished yet", {
        state,
        finishBlock: finishable.finishBlock,
      });
    }

    if (state === ROLE_STATE_LEARNING) return this.learnFinish(roleWallet);
    if (state === ROLE_STATE_CRAFTING) return this.coreWrite("agentbox.skills.craft.finish", "finishCrafting", [roleWallet], "Crafting completed", { roleWallet, allowedStates: new Set([ROLE_STATE_CRAFTING]), finishable: true });
    if (state === ROLE_STATE_GATHERING) return this.coreWrite("agentbox.skills.gather.finish", "finishGather", [roleWallet], "Gathering completed", { roleWallet, allowedStates: new Set([ROLE_STATE_GATHERING]), finishable: true });
    if (state === ROLE_STATE_TELEPORTING) return this.coreWrite("agentbox.skills.teleport.finish", "finishTeleport", [roleWallet], "Teleport completed", { roleWallet, allowedStates: new Set([ROLE_STATE_TELEPORTING]), finishable: true });
    throw precheckError("FINISH_NOT_SUPPORTED", "Current finishable state is not mapped to a finish action", {
      state,
      chainRoleState,
      finishBlock: finishable.finishBlock,
    });
  }

  async learnFinish(roleWallet) {
    const { wallet } = this.requireActiveSigner();
    const data = {
      roleSnapshot: await this.validateRoleState(roleWallet, new Set([ROLE_STATE_LEARNING])),
      finishable: await this.validateFinishBlockReady(roleWallet),
    };
    const tx = await this.client.sendTransaction(this.client.core, "finishLearning", [roleWallet], wallet);
    return successResult("agentbox.learn.finish", "Learning completed", { data, txHash: tx.txHash, chainId: this.settings.chainId, blockNumber: tx.blockNumber });
  }

  async cancelCurrentAction(roleWallet) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    const state = normalizeRoleState(me.role?.state);
    if (state === ROLE_STATE_LEARNING) return this.coreWrite("agentbox.skills.learn.cancel", "cancelLearning", [roleWallet], "Learning cancelled", { roleWallet, allowedStates: new Set([ROLE_STATE_LEARNING]) });
    if (state === ROLE_STATE_TEACHING) return this.coreWrite("agentbox.skills.teach.cancel", "cancelTeaching", [roleWallet], "Teaching cancelled", { roleWallet, allowedStates: new Set([ROLE_STATE_TEACHING]) });
    throw precheckError("CANCEL_NOT_SUPPORTED", "Current state does not support cancel", { state });
  }

  async stabilizeBalance(roleWallet) {
    const check = await this.checkStabilizePrerequisites(roleWallet);
    if (!check.canExecute) {
      throw precheckError("NO_STABILIZABLE_BALANCE", "Role does not currently have unreliable balance worth attempting to stabilize", {
        reasons: check.reasons,
        balances: check.balances,
        stabilizationBlocks: check.stabilizationBlocks,
        currentBlock: check.currentBlock,
      });
    }
    return this.economyWrite(
      "agentbox.skills.stabilize_balance",
      "stabilizeBalance",
      [roleWallet],
      "Stabilize balance transaction submitted",
      { roleWallet },
    );
  }

  async transferAgcToOwner(roleWallet, amount) {
    const requestedAmount = Number(amount || 0);
    if (!(requestedAmount > 0)) {
      throw precheckError("INVALID_AMOUNT", "Amount must be a positive integer", { amount });
    }

    const { wallet } = this.requireActiveSigner();
    const permission = await this.validateOwnerOrController(roleWallet, wallet.address);
    const balances = await this.client.getEconomyBalances(roleWallet);
    const reliableBalance = BigInt(balances.reliableBalance || 0);
    const transferAmount = BigInt(requestedAmount);

    if (reliableBalance < transferAmount) {
      throw precheckError("INSUFFICIENT_RELIABLE_BALANCE", "Role wallet does not have enough reliable AGC to transfer", {
        requestedAmount,
        reliableBalance: reliableBalance.toString(),
        owner: permission.owner,
      });
    }

    const roleWalletContract = this.client.roleWalletContract(roleWallet);
    const transferData = this.client.economy.interface.encodeFunctionData("transfer", [permission.owner, transferAmount]);
    const tx = await this.client.sendTransaction(
      roleWalletContract,
      "execute",
      [this.settings.economyAddress, 0, transferData],
      wallet,
    );

    return successResult("agentbox.skills.transfer_agc_to_owner", "Reliable AGC transfer to owner submitted", {
      data: {
        ...permission,
        amount: requestedAmount,
        token: "AGC",
        destination: permission.owner,
        balances: {
          totalBalance: balances.totalBalance,
          reliableBalance: balances.reliableBalance,
          unreliableBalance: balances.unreliableBalance,
        },
      },
      txHash: tx.txHash,
      chainId: this.settings.chainId,
      blockNumber: tx.blockNumber,
    });
  }

  async checkFinishable(roleWallet) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    const finishable = (await this.readActionFinishable(roleWallet)).data;
    return {
      role: roleWallet,
      state: me.role?.state,
      stateName: roleStateNameFromValue(me.role?.state),
      canFinish: Boolean(finishable.canFinish),
      finishBlock: finishable.finishBlock,
      finishState: finishable.state,
      finishStateName: roleStateNameFromValue(finishable.state),
    };
  }

  async checkGatherPrerequisites(roleWallet, amount) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    let currentLand = {};
    if (me.role?.x !== undefined && me.role?.y !== undefined) {
      try {
        currentLand = (await this.readLand({ x: Number(me.role.x), y: Number(me.role.y) }, "chain")).data || {};
      } catch {}
    }
    const learned = learnedSkillIds(me);
    const resourceType = Number(currentLand.resourceType || 0);
    const requestedAmount = Number(amount || 0);
    const canExecute = Boolean(currentLand.isResourcePoint)
      && normalizeRoleState(me.role?.state) === ROLE_STATE_IDLE
      && resourceType > 0
      && learned.has(resourceType)
      && requestedAmount > 0;
    const reasons = [];
    if (!currentLand.isResourcePoint) reasons.push("current_land_is_not_resource_point");
    if (normalizeRoleState(me.role?.state) !== ROLE_STATE_IDLE) reasons.push("role_is_not_idle");
    if (resourceType <= 0) reasons.push("resource_type_missing");
    else if (!learned.has(resourceType)) reasons.push("required_skill_not_learned");
    if (!(requestedAmount > 0)) reasons.push("invalid_amount");
    return {
      role: roleWallet,
      requestedAmount,
      canExecute,
      currentLand,
      requiredSkillId: resourceType || null,
      requiredSkillName: resourceType > 0 ? skillNameFromId(resourceType) : null,
      resourceTypeName: resourceType > 0 ? resourceNameFromId(resourceType) : null,
      learnedSkillIds: [...learned].sort(),
      learnedSkillNames: [...learned].sort((a, b) => a - b).map((item) => skillNameFromId(item)),
      reasons,
    };
  }

  async checkLearningPrerequisites(roleWallet, npcId) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    const learned = learnedSkillIds(me);
    let npc = null;
    try {
      npc = await this.client.getNpcSnapshot(npcId);
    } catch {}
    const atNpc = npc && Number(me.role?.x ?? -1) === Number(npc.x ?? -2) && Number(me.role?.y ?? -1) === Number(npc.y ?? -2);
    const skillId = Number(npc?.skillId || 0);
    let requiredBlocks = 0;
    if (skillId > 0) {
      try {
        requiredBlocks = Number(normalizeValue(await this.client.core.getSkillRequiredBlocks(skillId)) || 0);
      } catch {}
    }
    const canExecute = Boolean(npc)
      && normalizeRoleState(me.role?.state) === ROLE_STATE_IDLE
      && atNpc
      && !Boolean(npc?.isTeaching)
      && skillId > 0
      && requiredBlocks > 0
      && !learned.has(skillId);
    const reasons = [];
    if (!npc) reasons.push("npc_not_found");
    if (normalizeRoleState(me.role?.state) !== ROLE_STATE_IDLE) reasons.push("role_is_not_idle");
    if (npc && !atNpc) reasons.push("role_not_at_npc_position");
    if (npc?.isTeaching) reasons.push("npc_is_busy");
    if (!(requiredBlocks > 0)) reasons.push("skill_not_configured");
    if (skillId > 0 && learned.has(skillId)) reasons.push("skill_already_learned");
    return {
      role: roleWallet,
      npcId,
      npcName: npcId ? npcNameFromId(npcId) : null,
      canExecute,
      npc: npc ? this.annotateNpc({ npcId, ...npc }) : null,
      requiredSkillId: skillId || null,
      requiredSkillName: skillId > 0 ? skillNameFromId(skillId) : null,
      requiredBlocks,
      reasons,
    };
  }

  async checkCraftingPrerequisites(roleWallet, recipeId) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    const world = await this.buildWorldInfo(roleWallet);
    const recipe = (world.staticInfo?.recipe_catalog || []).find((item) => Number(item.recipeId || 0) === recipeId) || null;
    const learned = learnedSkillIds(me);
    const balances = resourceAmounts(me);
    const missingResources = [];
    if (recipe) {
      for (let i = 0; i < (recipe.requiredResources || []).length; i += 1) {
        const tokenId = Number(recipe.requiredResources[i] || 0);
        const amount = Number(recipe.requiredAmounts[i] || 0);
        if ((balances[tokenId] || 0) < amount) {
          missingResources.push({ tokenId, resourceName: resourceNameFromId(tokenId), required: amount, current: balances[tokenId] || 0 });
        }
      }
    }
    const canExecute = Boolean(recipe) && normalizeRoleState(me.role?.state) === ROLE_STATE_IDLE && learned.has(Number(recipe?.requiredSkill || 0)) && missingResources.length === 0;
    const reasons = [];
    if (!recipe) reasons.push("recipe_not_found");
    if (normalizeRoleState(me.role?.state) !== ROLE_STATE_IDLE) reasons.push("role_is_not_idle");
    if (recipe && !learned.has(Number(recipe.requiredSkill || 0))) reasons.push("required_skill_not_learned");
    if (missingResources.length) reasons.push("missing_resources");
    return {
      role: roleWallet,
      recipeId,
      recipeName: recipeId ? recipeNameFromId(recipeId) : null,
      canExecute,
      recipe,
      requiredSkillName: Number(recipe?.requiredSkill || 0) > 0 ? skillNameFromId(recipe.requiredSkill) : null,
      missingResources,
      reasons,
    };
  }

  async checkTriggerMintPrerequisites(roleWallet) {
    const resolvedRole = roleWallet || await this.resolveDefaultRole();
    if (!resolvedRole) {
      return {
        canExecute: false,
        currentBlock: null,
        mintIntervalBlocks: null,
        maxMintCount: null,
        mintsCount: null,
        lastMint: null,
        chainLastMintBlock: null,
        effectiveLastMintBlock: null,
        landsWithGroundTokensCount: null,
        reasons: ["missing_role"],
      };
    }
    const world = await this.buildWorldInfo(resolvedRole);
    const currentBlock = world.dynamicInfo?.current_block;
    const lastMint = world.dynamicInfo?.last_mint || {};
    const mintIntervalBlocks = world.staticInfo?.mint_interval_blocks;
    const maxMintCount = world.staticInfo?.max_mint_count;
    let mintsCount = null;
    let chainLastMintBlock = null;
    try {
      mintsCount = Number(await this.client.getMintsCount());
    } catch {}
    try {
      const value = await this.client.getLastMintBlock();
      chainLastMintBlock = value == null ? null : Number(value);
    } catch {}
    const landsWithGroundTokens = world.dynamicInfo?.lands_with_ground_tokens || [];
    const indexedLastMintBlock = lastMint.block_number != null ? Number(lastMint.block_number) : null;
    const effectiveLastMintBlock = chainLastMintBlock ?? indexedLastMintBlock;
    const enoughBlocks = currentBlock != null && mintIntervalBlocks != null && effectiveLastMintBlock != null && Number(currentBlock) - Number(effectiveLastMintBlock) >= Number(mintIntervalBlocks);
    const belowMaxMintCount = maxMintCount == null || mintsCount == null ? true : Number(mintsCount) < Number(maxMintCount);
    const reasons = [];
    if (!enoughBlocks) reasons.push("mint_interval_not_elapsed");
    if (!belowMaxMintCount) reasons.push("max_mint_count_reached");
    if (landsWithGroundTokens.length > 0) reasons.push("ground_tokens_present_strategy_signal");
    return {
      canExecute: enoughBlocks && belowMaxMintCount,
      currentBlock,
      mintIntervalBlocks,
      maxMintCount,
      mintsCount,
      lastMint,
      chainLastMintBlock,
      effectiveLastMintBlock,
      landsWithGroundTokensCount: landsWithGroundTokens.length,
      reasons,
    };
  }

  async checkStabilizePrerequisites(roleWallet) {
    const me = (await this.readMe(roleWallet, "chain")).data;
    let currentBlock = null;
    let stabilizationBlocks = null;
    try {
      currentBlock = Number(await this.client.provider.getBlockNumber());
    } catch {}
    try {
      const config = (await this.readGlobalConfig("chain")).data;
      stabilizationBlocks = Number(config?.stabilizationBlocks ?? 0) || 0;
    } catch {}

    const balances = {
      totalBalance: String(me.balances?.totalBalance ?? "0"),
      unreliableBalance: String(me.balances?.unreliableBalance ?? "0"),
      reliableBalance: String(me.balances?.reliableBalance ?? "0"),
    };
    const unreliableBalance = BigInt(balances.unreliableBalance || "0");
    const canExecute = unreliableBalance > 0n;
    const reasons = [];
    if (unreliableBalance <= 0n) reasons.push("no_unreliable_balance");

    return {
      role: roleWallet,
      canExecute,
      balances,
      currentBlock,
      stabilizationBlocks,
      exactMaturedAmountUnavailable: true,
      note: "The economy contract exposes aggregate unreliable balance, but not per-bucket maturity timestamps. This check tells you whether the role has unreliable AGC worth attempting to stabilize; the exact matured amount is determined onchain during stabilizeBalance.",
      reasons,
    };
  }

  async summarizeRoleState(roleWallet) {
    const snapshot = await this.buildRoleSnapshot(roleWallet);
    const dynamic = snapshot.dynamicInfo || {};
    return {
      role: roleWallet,
      state: dynamic.role?.state,
      stateName: dynamic.role?.stateName || roleStateNameFromValue(dynamic.role?.state),
      position: { x: dynamic.role?.x, y: dynamic.role?.y },
      finishable: dynamic.finishable,
      balances: dynamic.balances,
      resourceBalances: dynamic.resourceBalances,
    };
  }

  async summarizeWorldStaticInfo(roleWallet) {
    const staticInfo = (await this.buildWorldInfo(roleWallet)).staticInfo || {};
    return {
      npcCount: (staticInfo.all_npcs || []).length,
      recipeCount: (staticInfo.recipe_catalog || []).length,
      equipmentCount: Object.keys(staticInfo.equipment_catalog || {}).length,
      resourceLandCount: (staticInfo.all_resource_lands || []).length,
      mintIntervalBlocks: staticInfo.mint_interval_blocks,
    };
  }

  async summarizeWorldDynamicInfo(roleWallet) {
    const dynamicInfo = (await this.buildWorldInfo(roleWallet)).dynamicInfo || {};
    return {
      currentBlock: dynamicInfo.current_block,
      currentLand: dynamicInfo.current_land,
      currentLandResourceTypeName: dynamicInfo.current_land?.resourceTypeName || null,
      nearbyRoleCount: (dynamicInfo.nearby_roles || []).length,
      nearbyLandCount: (dynamicInfo.nearby_lands || []).length,
      landsWithGroundTokensCount: (dynamicInfo.lands_with_ground_tokens || []).length,
      lastMint: dynamicInfo.last_mint,
    };
  }

  async validateRuntime() {
    const networkChainId = await this.client.chainId();
    if (networkChainId !== this.settings.chainId) throw precheckError("INVALID_CHAIN_ID", `Expected chain id ${this.settings.chainId}, got ${networkChainId}`);
    for (const [key, address] of Object.entries({
      core: this.settings.coreAddress,
      role: this.settings.roleAddress,
      land: this.settings.landAddress,
      resource: this.settings.resourceAddress,
      economy: this.settings.economyAddress,
      config: this.settings.configAddress,
      randomizer: this.settings.randomizerAddress,
    })) {
      if (!ethers.isAddress(address)) throw precheckError("INVALID_ADDRESS", `Invalid configured address: ${key}`);
    }
  }

  async registrationConfirm({ profileMode, nickname, gender }) {
    await this.validateRuntime();
    const { wallet } = this.requireActiveSigner();
    const resolved = await this.resolveRegistrationProfile({ profileMode, nickname, gender });
    const ownedRolesBefore = await this.client.listOwnedRoles(wallet.address);
    let activeRole = null;
    try {
      activeRole = await this.requireValidatedActiveRole();
    } catch {}
    if (activeRole) {
      const registrationStage = await this.resolveRegistrationStage(activeRole.roleWallet);
      if (registrationStage.status === "role_created") {
      const currentBalanceWei = await this.client.getBalance(wallet.address);
      const minimumOwnerBalanceWei = ethers.parseEther(this.settings.autoMinOwnerBalanceEth);
      if (currentBalanceWei < minimumOwnerBalanceWei) {
        return this.topUpResult(wallet.address, currentBalanceWei, minimumOwnerBalanceWei, {
          roleId: activeRole.roleId,
          roleWallet: activeRole.roleWallet,
          stage: "after_registration",
          thresholdKind: "owner_auto",
          activeRole,
          ownedRolesCount: ownedRolesBefore.length,
        });
      }
      const activeSigner = await this.activeSignerSummary();
      return successResult("agentbox.registration.confirm", "Recovered registration state from chain", {
        data: {
          depositAddress: wallet.address,
          registrationStatus: registrationStage.status,
          registrationStage: registrationStage.stage,
          roleId: activeRole.roleId,
          role: activeRole.roleWallet,
          activeRole,
          ownedRolesCount: ownedRolesBefore.length,
          activeSigner,
          activeSignerBalanceEth: activeSigner?.balanceEth ?? null,
        },
      });
    }
    }

    let currentBalanceWei = await this.client.getBalance(wallet.address);
    const minimumBalanceWei = ethers.parseEther(this.settings.minNativeBalanceEth);
    if (currentBalanceWei < minimumBalanceWei) {
      return this.topUpResult(wallet.address, currentBalanceWei, minimumBalanceWei, {
        stage: "before_role_create",
        activeRole,
        ownedRolesCount: ownedRolesBefore.length,
      });
    }
    const createRequiredWei = await this.client.estimateRequiredBalance(this.client.core, resolved.nickname ? "createCharacter" : "createCharacter", resolved.nickname ? [resolved.nickname, resolved.gender] : [], wallet, ethers.parseEther(this.settings.registrationValueEth));
    const minimumRequired = createRequiredWei > minimumBalanceWei ? createRequiredWei : minimumBalanceWei;
    currentBalanceWei = await this.client.getBalance(wallet.address);
    if (currentBalanceWei < minimumRequired) {
      return this.topUpResult(wallet.address, currentBalanceWei, minimumRequired, {
        stage: "before_role_create",
        activeRole,
        ownedRolesCount: ownedRolesBefore.length,
      });
    }
    const tx = await this.client.sendTransaction(this.client.core, resolved.nickname ? "createCharacter" : "createCharacter", resolved.nickname ? [resolved.nickname, resolved.gender] : [], wallet, ethers.parseEther(this.settings.registrationValueEth));
    const ownedRolesAfter = await this.client.listOwnedRoles(wallet.address);
    const previousWallets = new Set(ownedRolesBefore.map((item) => item.roleWallet.toLowerCase()));
    const created = ownedRolesAfter.find((item) => !previousWallets.has(item.roleWallet.toLowerCase())) || ownedRolesAfter[ownedRolesAfter.length - 1];
    if (!created) throw txError("ROLE_CREATE_PARSE", "Unable to recover role creation from chain");
    const nextActiveRole = this.activeRoles.setActiveRole({
      roleId: created.roleId,
      roleWallet: created.roleWallet,
      ownerAddress: wallet.address,
    });
    const activeSigner = await this.activeSignerSummary();
    return successResult("agentbox.registration.confirm", "Registration confirmed with the active signer", {
      data: {
        depositAddress: wallet.address,
        currentBalanceEth: this.client.formatEth(await this.client.getBalance(wallet.address)),
        registrationStatus: "role_created",
        registrationStage: "pending_spawn",
        roleId: created.roleId,
        role: created.roleWallet,
        activeRole: nextActiveRole,
        ownedRolesCount: ownedRolesAfter.length,
        nickname: resolved.nickname,
        gender: resolved.gender,
        activeSigner,
        activeSignerBalanceEth: activeSigner?.balanceEth ?? null,
      },
      txHash: tx.txHash,
      chainId: this.settings.chainId,
      blockNumber: tx.blockNumber,
    });
  }

  async activeSignerSummary() {
    const { record } = this.signers.loadActiveWallet(this.client.provider);
    if (!record) return null;
    const activeRoleState = await this.maybeReadActiveRole();
    const ownedRoles = await this.client.listOwnedRoles(record.address);
    return {
      signerId: record.signer_id,
      address: record.address,
      label: record.label,
      balanceEth: this.client.formatEth(await this.client.getBalance(record.address)),
      ownedRolesCount: ownedRoles.length,
      activeRole: activeRoleState.activeRole,
    };
  }

  validateRoleProfileInputs(nickname, gender) {
    if (nickname == null && gender == null) return;
    if (nickname == null || gender == null) throw precheckError("INCOMPLETE_PROFILE", "nickname and gender must be provided together");
    if (nickname.length < 3 || nickname.length > 24) throw precheckError("INVALID_NICKNAME_LENGTH", "nickname length must be between 3 and 24 characters");
    if (Number(gender) > 2) throw precheckError("INVALID_GENDER", "gender must be 0, 1, or 2");
  }

  async nicknameAvailable(nickname) {
    const owner = await this.client.core.getRoleWalletByNickname(nickname);
    return !owner || owner === ZERO_ADDRESS;
  }

  async generateRegistrationProfile() {
    for (let i = 0; i < 12; i += 1) {
      const nickname = `agentbox${Math.floor(Math.random() * 900000) + 100000}`;
      if (await this.nicknameAvailable(nickname)) return { nickname, gender: Math.floor(Math.random() * 3) };
    }
    throw precheckError("NICKNAME_UNAVAILABLE", "Unable to generate an available nickname");
  }

  async resolveRegistrationProfile({ profileMode, nickname, gender }) {
    if (profileMode && !["manual", "skip", "auto_generate"].includes(profileMode)) {
      throw precheckError("INVALID_PROFILE_MODE", "profileMode must be manual, skip, or auto_generate");
    }
    if (profileMode === "skip") return { nickname: null, gender: null };
    if (profileMode === "auto_generate") return this.generateRegistrationProfile();
    this.validateRoleProfileInputs(nickname, gender);
    return { nickname: nickname ?? null, gender: gender ?? null };
  }

  async resolveRegistrationStage(roleWallet) {
    const snapshot = await this.client.getRoleSnapshot(roleWallet);
    if (normalizeRoleState(snapshot.state) === ROLE_STATE_PENDING_SPAWN) {
      return { status: "role_created", stage: "pending_spawn" };
    }
    return { status: "spawn_completed", stage: "spawn_completed" };
  }

  topUpResult(depositAddress, currentBalanceWei, requiredBalanceWei, { roleId, roleWallet, stage, thresholdKind = "registration", activeRole = null, ownedRolesCount = 0 }) {
    const thresholdName = thresholdKind === "registration" ? "MIN_NATIVE_BALANCE_ETH" : "AUTO_MIN_OWNER_BALANCE_ETH";
    const shortfallWei = requiredBalanceWei > currentBalanceWei ? requiredBalanceWei - currentBalanceWei : 0n;
    return successResult("agentbox.registration.confirm", "Active signer needs more ETH before registration can continue", {
      data: {
        depositAddress,
        requiredBalanceEth: this.client.formatEth(requiredBalanceWei),
        currentBalanceEth: this.client.formatEth(currentBalanceWei),
        shortfallEth: this.client.formatEth(shortfallWei),
        reason: "insufficient_gas",
        registrationStatus: "awaiting_topup",
        registrationStage: stage,
        thresholdKind,
        thresholdName,
        activeRole,
        ownedRolesCount,
        message: `Please send at least ${this.client.formatEth(shortfallWei)} more ETH to satisfy ${thresholdName}.`,
        ...(roleId != null ? { roleId } : {}),
        ...(roleWallet ? { role: roleWallet } : {}),
      },
    });
  }
}
