from __future__ import annotations

from typing import Any, Dict, Optional
import time

from eth_account.signers.local import LocalAccount
from web3 import Web3

from .config import BaseSettings
from .errors import tx_error


def resolve_account(account: Optional[LocalAccount] = None) -> LocalAccount:
    if account is not None:
        return account
    raise tx_error("MISSING_ACTIVE_SIGNER", "An active local signer is required for this transaction")


def build_transaction(
    web3: Web3,
    settings: BaseSettings,
    contract_function: Any,
    *,
    sender: str,
    value: int = 0,
    nonce: Optional[int] = None,
) -> Dict[str, Any]:
    tx = contract_function.build_transaction(
        {
            "from": sender,
            "nonce": web3.eth.get_transaction_count(sender) if nonce is None else nonce,
            "chainId": settings.chain_id,
            "value": value,
        }
    )
    gas_estimate = web3.eth.estimate_gas(tx)
    tx["gas"] = int(gas_estimate * 1.2)

    if "baseFeePerGas" in web3.eth.get_block("latest"):
        priority_fee = web3.to_wei(1, "gwei")
        tx["maxPriorityFeePerGas"] = priority_fee
        tx["maxFeePerGas"] = int(web3.eth.gas_price * 2) + priority_fee
    else:
        tx["gasPrice"] = web3.eth.gas_price
    return tx


def estimate_required_balance(
    web3: Web3,
    settings: BaseSettings,
    contract_function: Any,
    *,
    sender: str,
    value: int = 0,
    nonce: Optional[int] = None,
) -> int:
    tx = build_transaction(web3, settings, contract_function, sender=sender, value=value, nonce=nonce)
    gas_price = tx.get("maxFeePerGas", tx.get("gasPrice"))
    if gas_price is None:
        raise tx_error("GAS_PRICE_UNAVAILABLE", "Unable to determine gas price for transaction estimation")
    return int(value) + int(tx["gas"]) * int(gas_price)


def send_transaction(
    web3: Web3,
    settings: BaseSettings,
    contract_function: Any,
    *,
    value: int = 0,
    account: Optional[LocalAccount] = None,
) -> Dict[str, Any]:
    signer = resolve_account(account=account)
    sender = signer.address

    try:
        tx = build_transaction(web3, settings, contract_function, sender=sender, value=value)
        signed = signer.sign_transaction(tx)
        raw_tx = getattr(signed, "raw_transaction", None)
        if raw_tx is None:
            raw_tx = getattr(signed, "rawTransaction", None)
        if raw_tx is None:
            raise tx_error("SIGNED_TX_INVALID", "Signed transaction does not expose raw bytes")
        tx_hash = web3.eth.send_raw_transaction(raw_tx)
        receipt = web3.eth.wait_for_transaction_receipt(
            tx_hash,
            timeout=settings.tx_timeout_seconds,
            poll_latency=2,
        )
        if receipt.status != 1:
            raise tx_error("FAILED", "Transaction reverted on chain")
        target_block = int(receipt.blockNumber) + max(int(settings.receipt_confirmations) - 1, 0)
        if target_block > int(receipt.blockNumber):
            deadline = time.monotonic() + settings.tx_timeout_seconds
            while int(web3.eth.block_number) < target_block:
                if time.monotonic() >= deadline:
                    raise tx_error(
                        "CONFIRMATION_TIMEOUT",
                        f"Timed out waiting for {settings.receipt_confirmations} confirmations",
                    )
                time.sleep(2)
        return {
            "txHash": tx_hash.hex(),
            "blockNumber": receipt.blockNumber,
            "receipt": receipt,
            "sender": sender,
        }
    except Exception as exc:  # pragma: no cover - mapped for runtime safety
        if isinstance(exc, Exception) and hasattr(exc, "error_code"):
            raise
        raise tx_error("SEND_FAILED", str(exc)) from exc
