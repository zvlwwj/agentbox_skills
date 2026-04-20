import fs from "node:fs";
import path from "node:path";

import { ethers } from "ethers";

function abiFromFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(payload) ? payload : payload.abi;
}

export function createAgentboxContracts(settings, provider) {
  const abiDir = path.join(settings.coreRoot, "abi");
  const roleWalletAbi = abiFromFile(path.join(abiDir, "AgentboxRoleWallet.json"));
  return {
    core: new ethers.Contract(settings.coreAddress, abiFromFile(path.join(abiDir, "IAgentboxCore.json")), provider),
    role: new ethers.Contract(settings.roleAddress, abiFromFile(path.join(abiDir, "AgentboxRole.json")), provider),
    economy: new ethers.Contract(settings.economyAddress, abiFromFile(path.join(abiDir, "AgentboxEconomy.json")), provider),
    config: new ethers.Contract(settings.configAddress, abiFromFile(path.join(abiDir, "AgentboxConfig.json")), provider),
    resource: new ethers.Contract(settings.resourceAddress, abiFromFile(path.join(abiDir, "AgentboxResource.json")), provider),
    roleWalletAbi,
  };
}
