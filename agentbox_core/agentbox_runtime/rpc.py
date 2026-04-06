from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware as _POA_MIDDLEWARE
except ImportError:  # pragma: no cover - compatibility across web3 versions
    try:
        from web3.middleware import geth_poa_middleware as _POA_MIDDLEWARE
    except ImportError:  # pragma: no cover - compatibility fallback
        _POA_MIDDLEWARE = None

from .config import BaseSettings, ROOT_DIR
from .errors import rpc_error


ABI_DIR = ROOT_DIR / "abi"


def load_abi(filename: str) -> List[Dict[str, Any]]:
    path = ABI_DIR / filename
    if not path.exists():
        raise rpc_error("MISSING_ABI", f"ABI file not found: {filename}")
    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("abi"), list):
        return payload["abi"]
    raise rpc_error("INVALID_ABI", f"Unsupported ABI payload format: {filename}")


def make_web3(settings: BaseSettings) -> Web3:
    web3 = Web3(Web3.HTTPProvider(settings.rpc_url))
    if _POA_MIDDLEWARE is not None:
        web3.middleware_onion.inject(_POA_MIDDLEWARE, layer=0)
    if not web3.is_connected():
        raise rpc_error("RPC_UNAVAILABLE", f"Unable to connect to RPC: {settings.rpc_url}")
    if web3.eth.chain_id != settings.chain_id:
        raise rpc_error("CHAIN_ID_MISMATCH", f"RPC chain id mismatch: {web3.eth.chain_id}")
    return web3


def checksum(web3: Web3, address: str) -> str:
    return web3.to_checksum_address(address)


def load_contract(web3: Web3, address: str, abi_name: str):
    return web3.eth.contract(address=checksum(web3, address), abi=load_abi(abi_name))


def normalize_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, (list, tuple)):
        return [normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize_value(item) for key, item in value.items()}
    if hasattr(value, "_asdict"):
        return normalize_value(value._asdict())
    return value
