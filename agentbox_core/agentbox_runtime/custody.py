from __future__ import annotations

from eth_account.signers.local import LocalAccount
from typing import List, Optional, Tuple

from .config import PlayerSettings
from .wallet_store import CustodyWalletRecord, WalletStore


class CustodyService:
    def __init__(self, settings: PlayerSettings) -> None:
        self.store = WalletStore(settings)

    def prepare_registration_wallet(self) -> CustodyWalletRecord:
        return self.store.create_wallet()

    def load_account(self, wallet_id: str) -> Tuple[CustodyWalletRecord, LocalAccount]:
        return self.store.load_account(wallet_id)

    def list_registration_wallets(self) -> List[CustodyWalletRecord]:
        return self.store.list_records()

    def remember_registration_profile(
        self,
        wallet_id: str,
        *,
        nickname: Optional[str],
        gender: Optional[int],
    ) -> CustodyWalletRecord:
        return self.store.update_record(
            wallet_id,
            pending_nickname=nickname,
            pending_gender=gender,
        )

    def mark_role_created(
        self,
        wallet_id: str,
        *,
        role_id: int,
        role_wallet: str,
        registration_tx_hash: Optional[str] = None,
    ) -> CustodyWalletRecord:
        changes = {
            "status": "role_created",
            "role_id": role_id,
            "role_wallet": role_wallet,
            "pending_nickname": None,
            "pending_gender": None,
        }
        if registration_tx_hash is not None:
            changes["registration_tx_hash"] = registration_tx_hash
        return self.store.update_record(wallet_id, **changes)

    def mark_spawn_completed(
        self,
        wallet_id: str,
        *,
        role_id: int,
        role_wallet: str,
        registration_tx_hash: Optional[str] = None,
    ) -> CustodyWalletRecord:
        changes = {
            "status": "spawn_completed",
            "role_id": role_id,
            "role_wallet": role_wallet,
            "pending_nickname": None,
            "pending_gender": None,
        }
        if registration_tx_hash is not None:
            changes["registration_tx_hash"] = registration_tx_hash
        return self.store.update_record(wallet_id, **changes)
