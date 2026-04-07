from __future__ import annotations

from decimal import Decimal
import json
from pathlib import Path
from typing import Dict, Optional
from pydantic import BaseModel, Field
from web3 import Web3

from .errors import precheck_error


ROOT_DIR = Path(__file__).resolve().parent.parent
DEPLOYMENTS_PATH = ROOT_DIR / "deployments.json"
DEFAULT_SIGNER_STORE_DIR = ROOT_DIR / ".data" / "signers"


def _load_json_file(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


class BaseSettings(BaseModel):
    mode: str
    rpc_url: str = Field(alias="RPC_URL")
    chain_id: int = Field(alias="CHAIN_ID")
    core_address: str = Field(alias="CORE_ADDRESS")
    role_address: str = Field(alias="ROLE_ADDRESS")
    land_address: str = Field(alias="LAND_ADDRESS")
    resource_address: str = Field(alias="RESOURCE_ADDRESS")
    economy_address: str = Field(alias="ECONOMY_ADDRESS")
    config_address: str = Field(alias="CONFIG_ADDRESS")
    randomizer_address: str = Field(alias="RANDOMIZER_ADDRESS")
    receipt_confirmations: int = Field(default=1, alias="RECEIPT_CONFIRMATIONS")
    tx_timeout_seconds: int = Field(default=120, alias="TX_TIMEOUT_SECONDS")
    indexer_base_url: Optional[str] = Field(default=None, alias="INDEXER_BASE_URL")
    indexer_timeout_seconds: int = Field(default=10, alias="INDEXER_TIMEOUT_SECONDS")

    @classmethod
    def from_sources(cls, mode: str) -> "BaseSettings":
        deployments = {}
        if DEPLOYMENTS_PATH.exists():
            deployments = json.loads(DEPLOYMENTS_PATH.read_text())
            deployments = deployments.get("contracts", {})

        values = {
            "mode": mode,
            "RPC_URL": "https://sepolia.base.org",
            "CHAIN_ID": 84532,
            "CORE_ADDRESS": deployments.get("Core_Diamond"),
            "ROLE_ADDRESS": deployments.get("Role_NFT"),
            "LAND_ADDRESS": deployments.get("Land_ERC721"),
            "RESOURCE_ADDRESS": deployments.get("Resource_ERC1155"),
            "ECONOMY_ADDRESS": deployments.get("Economy_ERC20"),
            "CONFIG_ADDRESS": deployments.get("Config"),
            "RANDOMIZER_ADDRESS": deployments.get("Randomizer"),
            "RECEIPT_CONFIRMATIONS": 1,
            "TX_TIMEOUT_SECONDS": 120,
            "INDEXER_BASE_URL": "https://agentbox.world/api/",
            "INDEXER_TIMEOUT_SECONDS": 10,
        }
        values["SIGNER_STORE_PATH"] = str(DEFAULT_SIGNER_STORE_DIR)
        values["MIN_NATIVE_BALANCE_ETH"] = "0.012"
        values["REGISTRATION_VALUE_ETH"] = "0.01"
        values["AUTO_MIN_OWNER_BALANCE_ETH"] = "0.0005"
        return PlayerSettings.model_validate(values)

    def validate_runtime(self) -> None:
        if self.chain_id != 84532:
            raise precheck_error("INVALID_CHAIN_ID", f"Expected chain id 84532, got {self.chain_id}")

        addresses = [
            self.core_address,
            self.role_address,
            self.land_address,
            self.resource_address,
            self.economy_address,
            self.config_address,
            self.randomizer_address,
        ]
        for address in addresses:
            if not Web3.is_address(address):
                raise precheck_error("INVALID_ADDRESS", f"Invalid configured address: {address}")
        if not self.rpc_url:
            raise precheck_error("MISSING_RPC_URL", "RPC_URL is required")


class PlayerSettings(BaseSettings):
    signer_store_path: str = Field(default=str(DEFAULT_SIGNER_STORE_DIR), alias="SIGNER_STORE_PATH")
    min_native_balance_eth: Decimal = Field(default=Decimal("0.012"), alias="MIN_NATIVE_BALANCE_ETH")
    registration_value_eth: Decimal = Field(default=Decimal("0.01"), alias="REGISTRATION_VALUE_ETH")
    auto_min_owner_balance_eth: Decimal = Field(default=Decimal("0.0005"), alias="AUTO_MIN_OWNER_BALANCE_ETH")

    def signer_store_dir(self) -> Path:
        path = Path(self.signer_store_path)
        if not path.is_absolute():
            path = (ROOT_DIR / path).resolve()
        return path

    def registration_value_wei(self) -> int:
        return int(Web3.to_wei(self.registration_value_eth, "ether"))

    def minimum_native_balance_wei(self) -> int:
        return int(Web3.to_wei(self.min_native_balance_eth, "ether"))

    def auto_min_owner_balance_wei(self) -> int:
        return int(Web3.to_wei(self.auto_min_owner_balance_eth, "ether"))

    def validate_runtime(self) -> None:
        super().validate_runtime()
        if self.registration_value_eth <= 0:
            raise precheck_error("INVALID_REGISTRATION_VALUE", "REGISTRATION_VALUE_ETH must be greater than zero")
        if self.min_native_balance_eth < self.registration_value_eth:
            raise precheck_error("INVALID_MIN_NATIVE_BALANCE", "MIN_NATIVE_BALANCE_ETH must be greater than or equal to REGISTRATION_VALUE_ETH")
        if self.auto_min_owner_balance_eth <= 0:
            raise precheck_error("INVALID_AUTO_MIN_OWNER_BALANCE", "AUTO_MIN_OWNER_BALANCE_ETH must be greater than zero")


def load_player_settings() -> PlayerSettings:
    settings = PlayerSettings.from_sources("player")
    settings.validate_runtime()
    return settings
