import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ethers } from "ethers";

import {
  DEFAULT_SIGNER_LABEL,
  ZERO_ADDRESS,
  decodeCoreContracts,
  decodeEconomyBalances,
  decodeEquipmentSnapshot,
  decodeFinishable,
  decodeGlobalConfig,
  decodeLandSnapshot,
  decodeRoleActionSnapshot,
  decodeRoleIdentity,
  decodeRoleSnapshot,
  normalizeValue,
  precheckError,
  readJsonFile,
  rpcError,
  txError,
  utcNowIso,
  writeJsonFile,
} from "./common.js";

function abiFromFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(payload) ? payload : payload.abi;
}

export function loadSettings(pluginRoot) {
  const coreRoot = path.join(pluginRoot, "agentbox_core");
  const deploymentsPath = path.join(coreRoot, "deployments.json");
  const deploymentsPayload = readJsonFile(deploymentsPath, {}) || {};
  const contracts = deploymentsPayload.contracts || {};
  const dataDir = path.join(os.homedir(), ".openclaw", "skills", "agentbox-skills", ".data");
  return {
    pluginRoot,
    coreRoot,
    dataDir,
    signerStoreDir: path.join(dataDir, "signers"),
    rpcUrl: "https://sepolia.base.org",
    chainId: 84532,
    coreAddress: contracts.Core_Diamond,
    roleAddress: contracts.Role_NFT,
    landAddress: contracts.Land_ERC721,
    resourceAddress: contracts.Resource_ERC1155,
    economyAddress: contracts.Economy_ERC20,
    configAddress: contracts.Config,
    randomizerAddress: contracts.Randomizer,
    indexerBaseUrl: "https://api.agentbox.world/",
    indexerTimeoutMs: 10000,
    receiptConfirmations: 1,
    txTimeoutSeconds: 120,
    minNativeBalanceEth: "0.012",
    registrationValueEth: "0.01",
    autoMinOwnerBalanceEth: "0.0005",
  };
}

export class SignerStore {
  constructor(settings) {
    this.settings = settings;
    this.recordPath = path.join(settings.signerStoreDir, "active_signer.json");
  }

  normalizeRecord(record) {
    if (!record) return null;
    if (!record.label || record.label === "hosted-registration-owner") {
      record.label = DEFAULT_SIGNER_LABEL;
    }
    return record;
  }

  loadRecord() {
    const record = this.normalizeRecord(readJsonFile(this.recordPath, null));
    if (!record) return null;
    if (!record.updated_at) record.updated_at = utcNowIso();
    if (!record.created_at) record.created_at = record.updated_at;
    return record;
  }

  saveRecord(record) {
    writeJsonFile(this.recordPath, this.normalizeRecord(record));
  }

  createSigner(label) {
    const wallet = ethers.Wallet.createRandom();
    return this.ensureWallet(wallet, label);
  }

  ensureWallet(wallet, label) {
    const existing = this.loadRecord();
    const timestamp = utcNowIso();
    const record = {
      signer_id: existing?.address?.toLowerCase() === wallet.address.toLowerCase() ? existing.signer_id : timestamp.replace(/\D/g, ""),
      address: wallet.address,
      private_key: wallet.privateKey,
      label: label || DEFAULT_SIGNER_LABEL,
      created_at: existing?.address?.toLowerCase() === wallet.address.toLowerCase() ? existing.created_at : timestamp,
      updated_at: timestamp,
    };
    this.saveRecord(record);
    return record;
  }

  importSigner(privateKey, label) {
    const wallet = new ethers.Wallet(privateKey);
    return this.ensureWallet(wallet, label);
  }

  exportSigner() {
    const record = this.loadRecord();
    if (!record) throw precheckError("UNKNOWN_SIGNER_ID", "Signer was not found");
    return record;
  }

  loadActiveWallet(provider) {
    const record = this.loadRecord();
    if (!record) return { record: null, wallet: null };
    return { record, wallet: new ethers.Wallet(record.private_key, provider) };
  }
}

export class IndexerClient {
  constructor(baseUrl, timeoutMs = 10000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  buildUrl(pathname, query) {
    const url = new URL(pathname.replace(/^\//, ""), this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async getJson(pathname, query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = this.buildUrl(pathname, query);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw rpcError("INDEXER_HTTP", `Indexer request failed with status ${response.status}: ${url.toString()}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw rpcError("INDEXER_UNAVAILABLE", `Unable to reach indexer: ${url.toString()}`);
      }
      if (error?.errorCode) throw error;
      throw rpcError("INDEXER_UNAVAILABLE", `Unable to reach indexer: ${url.toString()}`);
    } finally {
      clearTimeout(timer);
    }
  }

  getRoleByWallet(roleWallet) { return this.getJson(`/wallets/${roleWallet}/role`); }
  getGlobalConfig() { return this.getJson("/configs/global"); }
  getIdMappings() { return this.getJson("/configs/id-mappings"); }
  getCoreContracts() { return this.getJson("/configs/core-contracts"); }
  getLandById(landId) { return this.getJson(`/lands/${landId}`); }
  getLandByCoordinate(x, y) { return this.getJson("/lands", { x_min: x, x_max: x, y_min: y, y_max: y, limit: 1, offset: 0 }); }
  listRoles(query = {}) { return this.getJson("/roles", query); }
  listLands(query = {}) { return this.getJson("/lands", query); }
  getLastMint() { return this.getJson("/economy/last-mint"); }
  listNpcConfigs(limit = 500, offset = 0) { return this.getJson("/configs/npcs", { limit, offset }); }
  listRecipeConfigs(limit = 500, offset = 0) { return this.getJson("/configs/recipes", { limit, offset }); }
  listEquipmentConfigs(limit = 500, offset = 0) { return this.getJson("/configs/equipment", { limit, offset }); }
}

export class AgentboxClient {
  constructor(settings) {
    this.settings = settings;
    this.provider = new ethers.JsonRpcProvider(settings.rpcUrl, settings.chainId, { staticNetwork: true });
    const abiDir = path.join(settings.coreRoot, "abi");
    this.core = new ethers.Contract(settings.coreAddress, abiFromFile(path.join(abiDir, "IAgentboxCore.json")), this.provider);
    this.role = new ethers.Contract(settings.roleAddress, abiFromFile(path.join(abiDir, "AgentboxRole.json")), this.provider);
    this.economy = new ethers.Contract(settings.economyAddress, abiFromFile(path.join(abiDir, "AgentboxEconomy.json")), this.provider);
    this.config = new ethers.Contract(settings.configAddress, abiFromFile(path.join(abiDir, "AgentboxConfig.json")), this.provider);
    this.resource = new ethers.Contract(settings.resourceAddress, abiFromFile(path.join(abiDir, "AgentboxResource.json")), this.provider);
    this.indexer = new IndexerClient(settings.indexerBaseUrl, settings.indexerTimeoutMs);
  }

  async chainId() {
    return Number((await this.provider.getNetwork()).chainId);
  }

  formatEth(wei) {
    return ethers.formatEther(BigInt(wei));
  }

  async getCoreContracts() {
    return decodeCoreContracts(await this.core.getCoreContracts());
  }

  async getGlobalConfig() {
    const decoded = decodeGlobalConfig(await this.core.getGlobalConfig());
    try {
      decoded.maxMintCount = normalizeValue(await this.config.maxMintCount());
    } catch {
      decoded.maxMintCount = null;
    }
    return decoded;
  }

  async getRoleIdentity(roleWallet) {
    return decodeRoleIdentity(await this.core.getRoleIdentity(roleWallet));
  }

  async getRoleSnapshot(roleWallet) {
    return decodeRoleSnapshot(await this.core.getRoleSnapshot(roleWallet));
  }

  async getRoleActionSnapshot(roleWallet) {
    return decodeRoleActionSnapshot(await this.core.getRoleActionSnapshot(roleWallet));
  }

  async getEconomyBalances(roleWallet) {
    return decodeEconomyBalances(await this.core.getEconomyBalances(roleWallet));
  }

  async canFinishCurrentAction(roleWallet) {
    return decodeFinishable(await this.core.canFinishCurrentAction(roleWallet));
  }

  async getEquippedBatch(roleWallet, slots) {
    return normalizeValue(await this.core.getEquippedBatch(roleWallet, slots));
  }

  async getRoleSkills(roleWallet, skillIds) {
    return normalizeValue(await this.core.getRoleSkills(roleWallet, skillIds));
  }

  async getResourceBalances(roleWallet, tokenIds) {
    const accounts = tokenIds.map(() => roleWallet);
    return normalizeValue(await this.resource.balanceOfBatch(accounts, tokenIds));
  }

  async getLand(selector) {
    if (selector.landId !== undefined && selector.landId !== null) {
      return decodeLandSnapshot(await this.core.getLandSnapshotById(selector.landId));
    }
    if (selector.x === undefined || selector.y === undefined) {
      throw precheckError("MISSING_LAND_SELECTOR", "Provide landId or both x and y");
    }
    return decodeLandSnapshot(await this.core.getLandSnapshot(selector.x, selector.y));
  }

  async getNpcSnapshot(npcId) {
    return normalizeValue(await this.core.getNpcSnapshot(npcId));
  }

  async getMintsCount() {
    return normalizeValue(await this.economy.mintsCount());
  }

  async getRecipeSnapshot(recipeId) {
    return decodeRecipeSnapshot(await this.core.getRecipeSnapshot(recipeId));
  }

  async getEquipmentSnapshot(equipmentId) {
    return decodeEquipmentSnapshot(await this.core.getEquipmentSnapshot(equipmentId));
  }

  async getEntityPosition(targetWallet) {
    return normalizeValue(await this.core.getEntityPosition(targetWallet));
  }

  async recoverOwnedRole(ownerAddress) {
    const balance = Number(await this.role.balanceOf(ownerAddress));
    if (balance <= 0) return null;
    const roleId = Number(await this.role.tokenOfOwnerByIndex(ownerAddress, balance - 1));
    const roleWallet = await this.role.wallets(roleId);
    return { roleId, roleWallet };
  }

  async buildTxRequest(contract, method, args, wallet, value = 0n) {
    const connected = contract.connect(wallet);
    const fn = connected.getFunction(method);
    const txRequest = await fn.populateTransaction(...args);
    txRequest.value = BigInt(value);
    txRequest.chainId = this.settings.chainId;
    txRequest.nonce = await this.provider.getTransactionCount(wallet.address);
    const gasEstimate = await this.provider.estimateGas({ ...txRequest, from: wallet.address });
    txRequest.gasLimit = gasEstimate * 12n / 10n;
    const feeData = await this.provider.getFeeData();
    if (feeData.maxFeePerGas != null || feeData.maxPriorityFeePerGas != null) {
      txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei");
      txRequest.maxFeePerGas = feeData.maxFeePerGas ?? ((await this.provider.getFeeData()).gasPrice ?? ethers.parseUnits("1", "gwei")) * 2n;
    } else {
      txRequest.gasPrice = feeData.gasPrice ?? await this.provider.getGasPrice();
    }
    return txRequest;
  }

  async estimateRequiredBalance(contract, method, args, wallet, value = 0n) {
    const txRequest = await this.buildTxRequest(contract, method, args, wallet, value);
    const gasPrice = txRequest.maxFeePerGas ?? txRequest.gasPrice;
    if (gasPrice == null) throw txError("GAS_PRICE_UNAVAILABLE", "Unable to determine gas price for transaction estimation");
    return BigInt(value) + BigInt(txRequest.gasLimit) * BigInt(gasPrice);
  }

  async sendTransaction(contract, method, args, wallet, value = 0n) {
    try {
      const connected = contract.connect(wallet);
      const txRequest = await this.buildTxRequest(contract, method, args, wallet, value);
      const txResponse = await wallet.sendTransaction(txRequest);
      const receipt = await txResponse.wait(this.settings.receiptConfirmations);
      if (!receipt || receipt.status !== 1n) throw txError("FAILED", "Transaction reverted on chain");
      return {
        txHash: txResponse.hash,
        blockNumber: Number(receipt.blockNumber),
        receipt,
      };
    } catch (error) {
      if (error?.errorCode) throw error;
      throw txError("SEND_FAILED", String(error?.message || error));
    }
  }

  async getBalance(address) {
    return await this.provider.getBalance(address);
  }
}
