from __future__ import annotations

from decimal import Decimal
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
from pydantic import BaseModel, Field
from web3 import Web3

from .errors import precheck_error

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args: Any, **_kwargs: Any) -> bool:
        return False


ROOT_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = ROOT_DIR.parent
DEPLOYMENTS_PATH = ROOT_DIR / "deployments.json"
OPENCLAW_DIR = Path.home() / ".openclaw"
OPENCLAW_CONFIG_PATH = OPENCLAW_DIR / "openclaw.json"
OPENCLAW_PLAYER_AUTH_PATH = OPENCLAW_DIR / "agents" / "player-agent" / "agent" / "auth-profiles.json"
OPENCLAW_SKILL_INSTALL_DIR = OPENCLAW_DIR / "skills" / "agentbox-skills"


def _load_json_file(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _resolve_openclaw_agent_model(config: Dict[str, Any]) -> Optional[str]:
    agents = ((config.get("agents") or {}).get("list") or [])
    for item in agents:
        if item.get("id") == "player-agent" and item.get("model"):
            return str(item["model"])
    defaults = (config.get("agents") or {}).get("defaults") or {}
    primary = ((defaults.get("model") or {}).get("primary"))
    return str(primary) if primary else None


def resolve_openclaw_runtime_model() -> Optional[str]:
    config = _load_json_file(OPENCLAW_CONFIG_PATH)
    model_ref = _resolve_openclaw_agent_model(config)
    if not model_ref or "/" not in model_ref:
        return None
    return model_ref.strip()


def resolve_openclaw_llm_task_status() -> Dict[str, Any]:
    config = _load_json_file(OPENCLAW_CONFIG_PATH)
    plugins = config.get("plugins") or {}
    entries = plugins.get("entries") or {}
    llm_task_entry = entries.get("llm-task") or {}
    allowed = plugins.get("allow") or []
    enabled = bool(llm_task_entry.get("enabled") is True)
    allowlisted = "llm-task" in allowed if isinstance(allowed, list) else False
    if enabled and allowlisted:
        status = "available"
    elif not enabled:
        status = "missing_llm_task_plugin"
    else:
        status = "llm_task_not_allowed"
    return {
        "enabled": enabled,
        "allowlisted": allowlisted,
        "status": status,
        "runtimeModel": _resolve_openclaw_agent_model(config),
    }


def _resolve_openclaw_api_key(provider: str, config: Dict[str, Any], auth_profiles: Dict[str, Any]) -> Optional[str]:
    env = config.get("env") or {}
    env_key_map = {
        "google": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    env_key_name = env_key_map.get(provider)
    if env_key_name:
        env_key = env.get(env_key_name)
        if isinstance(env_key, str) and env_key.strip():
            return env_key.strip()

    profiles = (auth_profiles.get("profiles") or {})
    for profile in profiles.values():
        if profile.get("provider") == provider and profile.get("type") == "api_key":
            key = profile.get("key")
            if isinstance(key, str) and key.strip():
                return key.strip()
    return None


def resolve_openclaw_llm_settings() -> Tuple[Optional[str], Optional[str], Optional[str]]:
    config = _load_json_file(OPENCLAW_CONFIG_PATH)
    auth_profiles = _load_json_file(OPENCLAW_PLAYER_AUTH_PATH)
    model_ref = _resolve_openclaw_agent_model(config)
    if not model_ref or "/" not in model_ref:
        return None, None, None

    provider, model = model_ref.split("/", 1)
    provider = provider.strip().lower()
    model = model.strip()
    api_key = _resolve_openclaw_api_key(provider, config, auth_profiles)
    if not api_key or not model:
        return None, None, None

    api_url_map = {
        "google": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "openai": "https://api.openai.com/v1/chat/completions",
        "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    }
    api_url = api_url_map.get(provider)
    if not api_url:
        return None, None, None
    return api_key, api_url, model


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
    explorer_api_key: Optional[str] = Field(default=None, alias="EXPLORER_API_KEY")
    explorer_api_url: Optional[str] = Field(default=None, alias="EXPLORER_API_URL")
    explorer_browser_base_url: Optional[str] = Field(default=None, alias="EXPLORER_BROWSER_BASE_URL")
    llm_api_key: Optional[str] = Field(default=None, alias="LLM_API_KEY")
    llm_api_url: Optional[str] = Field(default=None, alias="LLM_API_URL")
    llm_model: Optional[str] = Field(default=None, alias="LLM_MODEL")
    llm_source: Optional[str] = Field(default=None, alias="LLM_SOURCE")

    @classmethod
    def from_sources(cls, mode: str) -> "BaseSettings":
        load_dotenv(ROOT_DIR / ".env")
        load_dotenv(REPO_DIR / ".env")
        load_dotenv(ROOT_DIR / ".env.local")

        deployments = {}
        if DEPLOYMENTS_PATH.exists():
            deployments = json.loads(DEPLOYMENTS_PATH.read_text())
            deployments = deployments.get("contracts", {})

        def resolve_env(name: str, fallback: Optional[Union[str, int]] = None) -> Optional[Union[str, int]]:
            return os.getenv(name, fallback)

        explicit_llm_key = resolve_env("LLM_API_KEY")
        explicit_llm_url = resolve_env("LLM_API_URL")
        explicit_llm_model = resolve_env("LLM_MODEL")
        openclaw_llm_key, openclaw_llm_url, openclaw_llm_model = resolve_openclaw_llm_settings()

        if explicit_llm_key and explicit_llm_url and explicit_llm_model:
            resolved_llm_key = explicit_llm_key
            resolved_llm_url = explicit_llm_url
            resolved_llm_model = explicit_llm_model
            resolved_llm_source = "explicit_env"
        elif openclaw_llm_key and openclaw_llm_url and openclaw_llm_model:
            resolved_llm_key = openclaw_llm_key
            resolved_llm_url = openclaw_llm_url
            resolved_llm_model = openclaw_llm_model
            resolved_llm_source = "openclaw_agent_config"
        else:
            resolved_llm_key = None
            resolved_llm_url = None
            resolved_llm_model = None
            resolved_llm_source = None

        values = {
            "mode": mode,
            "RPC_URL": resolve_env("RPC_URL"),
            "CHAIN_ID": int(resolve_env("CHAIN_ID", 84532)),
            "CORE_ADDRESS": resolve_env("CORE_ADDRESS", deployments.get("Core_Diamond")),
            "ROLE_ADDRESS": resolve_env("ROLE_ADDRESS", deployments.get("Role_NFT")),
            "LAND_ADDRESS": resolve_env("LAND_ADDRESS", deployments.get("Land_ERC721")),
            "RESOURCE_ADDRESS": resolve_env("RESOURCE_ADDRESS", deployments.get("Resource_ERC1155")),
            "ECONOMY_ADDRESS": resolve_env("ECONOMY_ADDRESS", deployments.get("Economy_ERC20")),
            "CONFIG_ADDRESS": resolve_env("CONFIG_ADDRESS", deployments.get("Config")),
            "RANDOMIZER_ADDRESS": resolve_env("RANDOMIZER_ADDRESS", deployments.get("Randomizer")),
            "RECEIPT_CONFIRMATIONS": int(resolve_env("RECEIPT_CONFIRMATIONS", 1)),
            "TX_TIMEOUT_SECONDS": int(resolve_env("TX_TIMEOUT_SECONDS", 120)),
            "INDEXER_BASE_URL": resolve_env("INDEXER_BASE_URL"),
            "INDEXER_TIMEOUT_SECONDS": int(resolve_env("INDEXER_TIMEOUT_SECONDS", 10)),
            "EXPLORER_API_KEY": resolve_env("EXPLORER_API_KEY"),
            "EXPLORER_API_URL": resolve_env("EXPLORER_API_URL"),
            "EXPLORER_BROWSER_BASE_URL": resolve_env("EXPLORER_BROWSER_BASE_URL"),
            "LLM_API_KEY": resolved_llm_key,
            "LLM_API_URL": resolved_llm_url,
            "LLM_MODEL": resolved_llm_model,
            "LLM_SOURCE": resolved_llm_source,
        }
        values["CUSTODY_STORE_PATH"] = resolve_env("CUSTODY_STORE_PATH", str(ROOT_DIR / ".data" / "custody_wallets"))
        values["SIGNER_STORE_PATH"] = resolve_env("SIGNER_STORE_PATH", str(ROOT_DIR / ".data" / "signers"))
        values["MIN_NATIVE_BALANCE_ETH"] = resolve_env("MIN_NATIVE_BALANCE_ETH", "0.012")
        values["REGISTRATION_VALUE_ETH"] = resolve_env("REGISTRATION_VALUE_ETH", "0.01")
        values["AUTO_MIN_OWNER_BALANCE_ETH"] = resolve_env("AUTO_MIN_OWNER_BALANCE_ETH", "0.0005")
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
    custody_store_path: str = Field(default=str(ROOT_DIR / ".data" / "custody_wallets"), alias="CUSTODY_STORE_PATH")
    signer_store_path: str = Field(default=str(ROOT_DIR / ".data" / "signers"), alias="SIGNER_STORE_PATH")
    min_native_balance_eth: Decimal = Field(default=Decimal("0.012"), alias="MIN_NATIVE_BALANCE_ETH")
    registration_value_eth: Decimal = Field(default=Decimal("0.01"), alias="REGISTRATION_VALUE_ETH")
    auto_min_owner_balance_eth: Decimal = Field(default=Decimal("0.0005"), alias="AUTO_MIN_OWNER_BALANCE_ETH")

    def custody_store_dir(self) -> Path:
        path = Path(self.custody_store_path)
        if not path.is_absolute():
            path = (ROOT_DIR / path).resolve()
        return path

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
