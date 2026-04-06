from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from web3 import Web3

from .config import BaseSettings
from .rpc import load_contract, normalize_value


@dataclass
class AgentboxContracts:
    web3: Web3
    settings: BaseSettings

    def __post_init__(self) -> None:
        self.core = load_contract(self.web3, self.settings.core_address, "IAgentboxCore.json")
        self.role = load_contract(self.web3, self.settings.role_address, "AgentboxRole.json")
        self.economy = load_contract(self.web3, self.settings.economy_address, "AgentboxEconomy.json")
        self.config = load_contract(self.web3, self.settings.config_address, "AgentboxConfig.json")
        self.land = load_contract(self.web3, self.settings.land_address, "AgentboxLand.json")
        self.resource = load_contract(self.web3, self.settings.resource_address, "AgentboxResource.json")

    def call(self, contract_name: str, method: str, *args: Any) -> Any:
        contract = getattr(self, contract_name)
        return normalize_value(getattr(contract.functions, method)(*args).call())


class CoreAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.core

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("core", method, *args)


class RoleAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.role

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("role", method, *args)


class EconomyAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.economy

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("economy", method, *args)


class ConfigAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.config

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("config", method, *args)


class LandAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.land

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("land", method, *args)


class ResourceAdapter:
    def __init__(self, contracts: AgentboxContracts):
        self.contracts = contracts
        self.contract = contracts.resource

    def call(self, method: str, *args: Any) -> Any:
        return self.contracts.call("resource", method, *args)
