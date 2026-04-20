import path from "node:path";

import { openClawDataDir, readJsonFile } from "./common.js";

export function resolveAgentboxDataDir(overrides = {}) {
  return overrides.dataDir || process.env.AGENTBOX_DATA_DIR || openClawDataDir();
}

export function loadSettings(pluginRoot, overrides = {}) {
  const coreRoot = path.join(pluginRoot, "agentbox_core");
  const deploymentsPath = path.join(coreRoot, "deployments.json");
  const deploymentsPayload = readJsonFile(deploymentsPath, {}) || {};
  const contracts = deploymentsPayload.contracts || {};
  const dataDir = resolveAgentboxDataDir(overrides);
  const settings = {
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
  return { ...settings, ...overrides, dataDir, signerStoreDir: path.join(dataDir, "signers") };
}
