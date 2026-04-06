from __future__ import annotations

from dataclasses import dataclass

from web3 import Web3

from .decoders import decode_role_snapshot
from .errors import precheck_error


@dataclass
class Precheck:
    core: object
    role: object
    economy: object
    web3: Web3

    def validate_address(self, address: str, field_name: str = "address") -> None:
        if not Web3.is_address(address):
            raise precheck_error("INVALID_ADDRESS", f"{field_name} is not a valid address", {"field": field_name})

    def validate_role_wallet(self, role_wallet: str) -> tuple[bool, int, str, str]:
        self.validate_address(role_wallet, "role")
        is_valid, role_id, owner, controller = self.core.call("getRoleIdentity", role_wallet)
        if not is_valid:
            raise precheck_error("INVALID_ROLE", "role is not a registered in-game entity")
        return is_valid, role_id, owner, controller

    def validate_owner_or_controller(self, role_wallet: str, signer_address: str) -> dict[str, object]:
        _, role_id, owner, controller = self.validate_role_wallet(role_wallet)
        signer = self.web3.to_checksum_address(signer_address)
        owner = self.web3.to_checksum_address(owner)
        controller = self.web3.to_checksum_address(controller) if controller != "0x0000000000000000000000000000000000000000" else controller
        if signer != owner and signer != controller:
            raise precheck_error(
                "NOT_OWNER_OR_CONTROLLER",
                "Signer is not the owner or controller of the role",
                {"roleId": role_id, "owner": owner, "controller": controller},
            )
        return {"roleId": role_id, "owner": owner, "controller": controller}

    def validate_role_state(self, role_wallet: str, allowed_states: set[int]) -> dict[str, object]:
        snapshot = decode_role_snapshot(self.core.call("getRoleSnapshot", role_wallet))
        state = snapshot["state"]
        if state not in allowed_states:
            raise precheck_error(
                "ROLE_STATE_INVALID",
                "Role state does not allow this action",
                {"state": state, "allowedStates": sorted(allowed_states)},
            )
        return snapshot

    def validate_finish_block_ready(self, role_wallet: str) -> dict[str, object]:
        can_finish, state, finish_block = self.core.call("canFinishCurrentAction", role_wallet)
        if not can_finish:
            raise precheck_error(
                "ACTION_NOT_FINISHABLE",
                "Current action cannot be finished yet",
                {"state": state, "finishBlock": finish_block},
            )
        return {"state": state, "finishBlock": finish_block}

    def validate_balances(self, account: str, minimum_reliable_balance: int = 0) -> dict[str, int]:
        total, unreliable, reliable = self.core.call("getEconomyBalances", account)
        if reliable < minimum_reliable_balance:
            raise precheck_error(
                "INSUFFICIENT_RELIABLE_BALANCE",
                "Reliable balance is insufficient",
                {"required": minimum_reliable_balance, "reliable": reliable},
            )
        return {
            "totalBalance": total,
            "unreliableBalance": unreliable,
            "reliableBalance": reliable,
        }

    def validate_target_exists(self, target_wallet: str) -> dict[str, object]:
        self.validate_address(target_wallet, "targetWallet")
        valid, x, y = self.core.call("getEntityPosition", target_wallet)
        if not valid:
            raise precheck_error("INVALID_TARGET", "Target entity does not exist", {"targetWallet": target_wallet})
        return {"targetWallet": target_wallet, "x": x, "y": y}

    def validate_land_constraints(self, role_wallet: str, x: int, y: int) -> dict[str, object]:
        role_snapshot = decode_role_snapshot(self.core.call("getRoleSnapshot", role_wallet))
        if role_snapshot["x"] != x or role_snapshot["y"] != y:
            raise precheck_error(
                "ROLE_NOT_ON_LAND",
                "Role must stand on the target land coordinate",
                {"roleX": role_snapshot["x"], "roleY": role_snapshot["y"], "x": x, "y": y},
            )
        return role_snapshot
