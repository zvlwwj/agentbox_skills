from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from eth_account.signers.local import LocalAccount
from web3 import Web3

from .adapters import AgentboxContracts, CoreAdapter, EconomyAdapter, LandAdapter, ResourceAdapter, RoleAdapter
from .action_support import ActionSupport
from .config import load_player_settings
from .decoders import (
    decode_core_contracts,
    decode_economy_balances,
    decode_equipment_snapshot,
    decode_finishable,
    decode_global_config,
    decode_land_snapshot,
    decode_npc_snapshot,
    decode_recipe_snapshot,
    decode_role_action_snapshot,
    decode_role_identity,
    decode_role_snapshot,
)
from .errors import AgentboxSkillError, map_exception, precheck_error
from .indexer import IndexerClient
from .precheck import Precheck
from .results import error_result, success_result
from .rpc import make_web3
from .schemas import ADDRESS, BOOL, PROFILE_MODE, READ_SOURCE, ROLE, STRING, TARGET_WALLET, UINT, obj
from .signer_store import SignerService
from .state import (
    ROLE_STATE_CRAFTING,
    ROLE_STATE_GATHERING,
    ROLE_STATE_IDLE,
    ROLE_STATE_LEARNING,
    ROLE_STATE_PENDING_SPAWN,
    ROLE_STATE_TELEPORTING,
    ROLE_STATE_TEACHING,
    normalize_role_state,
)
from .tooling import ToolSpec
from .tx import estimate_required_balance, send_transaction
from .world_info import WorldInfoBuilder


ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
DEFAULT_ROLE_RESOURCE_TOKEN_IDS = [1, 2, 3]
DEFAULT_ROLE_EQUIPMENT_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8]
ID_MAPPINGS_PATH = Path(__file__).resolve().parents[1] / "id-mappings.json"


class PlayerRuntime:
    def __init__(self) -> None:
        self.settings = load_player_settings()
        self.web3 = make_web3(self.settings)
        self.contracts = AgentboxContracts(self.web3, self.settings)
        self.core = CoreAdapter(self.contracts)
        self.role = RoleAdapter(self.contracts)
        self.economy = EconomyAdapter(self.contracts)
        self.land = LandAdapter(self.contracts)
        self.resource = ResourceAdapter(self.contracts)
        self.signers = SignerService(self.settings)
        self.signer_record, self.signer = self.signers.load_active_account()
        self.indexer = None
        if self.settings.indexer_base_url:
            self.indexer = IndexerClient(
                self.settings.indexer_base_url,
                timeout_seconds=self.settings.indexer_timeout_seconds,
            )
        self.precheck = Precheck(self.core, self.role, self.economy, self.web3)
        self.auto_control_plane = None
        self.world_info_builder = WorldInfoBuilder(self)
        self.action_support = ActionSupport(self)
        self.tools = {tool.name: tool for tool in self._build_tools()}

    def list_tools(self) -> List[Dict[str, Any]]:
        return [tool.to_manifest() for tool in self.tools.values()]

    def invoke(self, tool_name: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = dict(payload or {})
        if tool_name not in self.tools:
            return error_result(tool_name, precheck_error("UNKNOWN_TOOL", f"Unknown tool: {tool_name}"))
        tool = self.tools[tool_name]
        try:
            normalized_payload = self._normalize_tool_payload(tool, payload)
            self._validate_tool_payload(tool, normalized_payload)
            return tool.handler(self, normalized_payload)
        except Exception as exc:  # pragma: no cover - runtime guard
            return error_result(tool_name, map_exception(exc))

    def _normalize_tool_payload(self, tool: ToolSpec, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(payload)
        parameters = tool.parameters or {}
        properties = parameters.get("properties") or {}
        if "role" in properties and not normalized.get("role"):
            default_role = self._resolve_default_role()
            if default_role:
                normalized["role"] = default_role
        return normalized

    def _validate_tool_payload(self, tool: ToolSpec, payload: Dict[str, Any]) -> None:
        parameters = tool.parameters or {}
        required = parameters.get("required") or []
        for field_name in required:
            value = payload.get(field_name)
            if value is None or value == "":
                raise precheck_error(
                    "MISSING_REQUIRED_FIELD",
                    f"Missing required field: {field_name}",
                    {"field": field_name, "tool": tool.name},
                )

    def _resolve_default_role(self) -> Optional[str]:
        state_store = getattr(getattr(self, "auto_control_plane", None), "state_store", None)
        if state_store is not None:
            try:
                state = state_store.load_runtime_state()
                if getattr(state, "role", None):
                    return state.role
            except Exception:
                pass

        signer = getattr(self, "signer", None)
        if signer is not None:
            try:
                recovered = self._recover_owned_role(signer.address)
                if recovered is not None:
                    _, role_wallet = recovered
                    return role_wallet
            except Exception:
                pass
        return None

    def _build_tools(self) -> List[ToolSpec]:
        return [
            ToolSpec("agentbox.signer.prepare", "Create the single local gameplay private key.", obj({"label": STRING}), lambda rt, p: rt.signer_prepare(label=p.get("label"))),
            ToolSpec("agentbox.signer.import", "Import the single local gameplay private key.", obj({"privateKey": STRING, "label": STRING}, ["privateKey"]), lambda rt, p: rt.signer_import(private_key=p["privateKey"], label=p.get("label"))),
            ToolSpec("agentbox.signer.export", "Export the currently stored local gameplay private key.", obj({}), lambda rt, p: rt.signer_export()),
            ToolSpec("agentbox.signer.read", "Read the current local signer state.", obj({}), lambda rt, p: rt.signer_read()),
            ToolSpec("agentbox.registration.confirm", "Confirm direct registration with the active signer and continue registration.", obj({"profileMode": PROFILE_MODE, "nickname": STRING, "gender": UINT}), lambda rt, p: rt.registration_confirm(profile_mode=p.get("profileMode"), nickname=p.get("nickname"), gender=p.get("gender"))),
            ToolSpec("agentbox.skills.read_role_snapshot", "Read the current role snapshot grouped into staticInfo and dynamicInfo.", obj({"role": ROLE, "source": READ_SOURCE}), lambda rt, p: rt.read_role_snapshot(p["role"])),
            ToolSpec("agentbox.skills.read_world_static_info", "Read lower-frequency world facts used for planning.", obj({"role": ROLE}), lambda rt, p: rt.read_world_static_info(p["role"])),
            ToolSpec("agentbox.skills.read_world_dynamic_info", "Read frequently changing world facts near the current role.", obj({"role": ROLE}), lambda rt, p: rt.read_world_dynamic_info(p["role"])),
            ToolSpec("agentbox.skills.read_nearby_roles", "Read nearby roles around the current role.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.read_nearby_roles(p["role"])),
            ToolSpec("agentbox.skills.read_nearby_lands", "Read nearby lands around the current role.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.read_nearby_lands(p["role"])),
            ToolSpec("agentbox.skills.read_land", "Read one land by landId or coordinate.", obj({"landId": UINT, "x": UINT, "y": UINT, "source": READ_SOURCE}), lambda rt, p: rt.read_land({"landId": p.get("landId"), "x": p.get("x"), "y": p.get("y")}, source=p.get("source"))),
            ToolSpec("agentbox.skills.read_last_mint", "Read the last mint event observed by the indexer.", obj({}), lambda rt, p: rt.read_last_mint()),
            ToolSpec("agentbox.skills.read_lands_with_ground_tokens", "Read all lands that currently have ground tokens.", obj({}), lambda rt, p: rt.read_lands_with_ground_tokens()),
            ToolSpec("agentbox.skills.read_id_mappings", "Read the Agentbox ID mappings table from the indexer.", obj({}), lambda rt, p: rt.read_id_mappings()),
            ToolSpec("agentbox.skills.read_global_config", "Read current global config values.", obj({"source": READ_SOURCE}), lambda rt, p: rt.read_global_config(source=p.get("source"))),
            ToolSpec("agentbox.skills.move.instant", "Submit an instant move to a target coordinate.", obj({"role": ROLE, "x": UINT, "y": UINT}, ["role", "x", "y"]), lambda rt, p: rt.move_instant(p["role"], int(p["x"]), int(p["y"]))),
            ToolSpec("agentbox.skills.teleport.start", "Start teleporting to a target coordinate.", obj({"role": ROLE, "x": UINT, "y": UINT}, ["role", "x", "y"]), lambda rt, p: rt.teleport_start(p["role"], int(p["x"]), int(p["y"]))),
            ToolSpec("agentbox.skills.finish_current_action", "Finish the current action if it is finishable.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.finish_current_action(p["role"])),
            ToolSpec("agentbox.skills.gather.start", "Start gathering on the current resource land.", obj({"role": ROLE, "amount": UINT}, ["role", "amount"]), lambda rt, p: rt.gather_start(p["role"], int(p["amount"]))),
            ToolSpec("agentbox.skills.learn.npc.start", "Start learning from a nearby NPC.", obj({"role": ROLE, "npcId": UINT}, ["role", "npcId"]), lambda rt, p: rt.learn_npc_start(p["role"], int(p["npcId"]))),
            ToolSpec("agentbox.skills.learn.player.request", "Request learning a skill from another player.", obj({"role": ROLE, "teacherWallet": TARGET_WALLET, "skillId": UINT}, ["role", "teacherWallet", "skillId"]), lambda rt, p: rt.learn_player_request(p["role"], p["teacherWallet"], int(p["skillId"]))),
            ToolSpec("agentbox.skills.learn.player.accept", "Accept teaching another player.", obj({"role": ROLE, "studentWallet": TARGET_WALLET}, ["role", "studentWallet"]), lambda rt, p: rt.learn_player_accept(p["role"], p["studentWallet"])),
            ToolSpec("agentbox.skills.craft.start", "Start crafting a recipe.", obj({"role": ROLE, "recipeId": UINT}, ["role", "recipeId"]), lambda rt, p: rt.craft_start(p["role"], int(p["recipeId"]))),
            ToolSpec("agentbox.skills.combat.attack", "Attack another nearby player.", obj({"role": ROLE, "targetWallet": TARGET_WALLET}, ["role", "targetWallet"]), lambda rt, p: rt.attack(p["role"], p["targetWallet"])),
            ToolSpec("agentbox.skills.equip.put_on", "Equip an owned equipment item.", obj({"role": ROLE, "equipmentId": UINT}, ["role", "equipmentId"]), lambda rt, p: rt.equip_put_on(p["role"], int(p["equipmentId"]))),
            ToolSpec("agentbox.skills.equip.take_off", "Unequip an equipment slot.", obj({"role": ROLE, "slot": UINT}, ["role", "slot"]), lambda rt, p: rt.equip_take_off(p["role"], int(p["slot"]))),
            ToolSpec("agentbox.skills.land.buy", "Buy the current target land.", obj({"role": ROLE, "x": UINT, "y": UINT}, ["role", "x", "y"]), lambda rt, p: rt.buy_land(p["role"], int(p["x"]), int(p["y"]))),
            ToolSpec("agentbox.skills.land.set_contract", "Set a contract address on a land you own.", obj({"role": ROLE, "x": UINT, "y": UINT, "contractAddress": ADDRESS}, ["role", "x", "y", "contractAddress"]), lambda rt, p: rt.set_land_contract(p["role"], int(p["x"]), int(p["y"]), p["contractAddress"])),
            ToolSpec("agentbox.skills.social.dm", "Send a direct message to another player.", obj({"role": ROLE, "toWallet": TARGET_WALLET, "message": STRING}, ["role", "toWallet", "message"]), lambda rt, p: rt.send_direct_message(p["role"], p["toWallet"], p["message"])),
            ToolSpec("agentbox.skills.social.global", "Send a global message.", obj({"role": ROLE, "message": STRING}, ["role", "message"]), lambda rt, p: rt.send_global_message(p["role"], p["message"])),
            ToolSpec("agentbox.skills.cancel_current_action", "Cancel the current cancelable action.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.cancel_current_action(p["role"])),
            ToolSpec("agentbox.skills.trigger_mint", "Trigger token mint when mint prerequisites are satisfied.", obj({}), lambda rt, p: rt.trigger_mint()),
            ToolSpec("agentbox.skills.check_finishable", "Check whether the current action can finish now.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.check_finishable(p["role"])),
            ToolSpec("agentbox.skills.check_gather_prerequisites", "Check whether gathering can start on the current land.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.check_gather_prerequisites(p["role"])),
            ToolSpec("agentbox.skills.check_learning_prerequisites", "Check whether learning from an NPC can start now.", obj({"role": ROLE, "npcId": UINT}, ["role", "npcId"]), lambda rt, p: rt.check_learning_prerequisites(p["role"], int(p["npcId"]))),
            ToolSpec("agentbox.skills.check_crafting_prerequisites", "Check whether crafting a recipe can start now.", obj({"role": ROLE, "recipeId": UINT}, ["role", "recipeId"]), lambda rt, p: rt.check_crafting_prerequisites(p["role"], int(p["recipeId"]))),
            ToolSpec("agentbox.skills.check_trigger_mint_prerequisites", "Check whether the token mint interval has elapsed and no ground tokens remain on the map.", obj({"role": ROLE}), lambda rt, p: rt.check_trigger_mint_prerequisites(p.get("role") or rt._resolve_default_role() or "")),
            ToolSpec("agentbox.skills.summarize_role_state", "Summarize the current role state for dialogue planning.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.summarize_role_state(p["role"])),
            ToolSpec("agentbox.skills.summarize_world_static_info", "Summarize lower-frequency world facts for dialogue planning.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.summarize_world_static_info(p["role"])),
            ToolSpec("agentbox.skills.summarize_world_dynamic_info", "Summarize current nearby world dynamics for dialogue planning.", obj({"role": ROLE}, ["role"]), lambda rt, p: rt.summarize_world_dynamic_info(p["role"])),
        ]

    def _select_read_source(self, requested_source: Optional[str], *, indexer_supported: bool) -> str:
        source = requested_source or "auto"
        if source not in {"auto", "chain", "indexer"}:
            raise precheck_error("INVALID_READ_SOURCE", "source must be auto, chain, or indexer")
        if source == "chain":
            return "chain"
        if source == "indexer":
            if self.indexer is None:
                raise precheck_error("INDEXER_NOT_CONFIGURED", "INDEXER_BASE_URL is required for indexer reads")
            if not indexer_supported:
                raise precheck_error("INDEXER_UNSUPPORTED", "This read does not have an indexer-backed implementation")
            return "indexer"
        if self.indexer is not None and indexer_supported:
            return "indexer"
        return "chain"

    def _read_core_contracts_from_indexer(self) -> Dict[str, Any]:
        payload = self.indexer.get_core_contracts()
        return decode_core_contracts(
            {
                "roleContract": payload["item"]["role_contract"],
                "configContract": payload["item"]["config_contract"],
                "economyContract": payload["item"]["economy_contract"],
                "randomizerContract": payload["item"]["randomizer_contract"],
                "resourceContract": payload["item"]["resource_contract"],
                "landContract": payload["item"]["land_contract"],
            }
        )

    def _read_global_config_from_indexer(self) -> Dict[str, Any]:
        payload = self.indexer.get_global_config()
        item = payload["item"]
        return decode_global_config(
            {
                "mapWidth": item["map_width"],
                "mapHeight": item["map_height"],
                "mintIntervalBlocks": item["mint_interval_blocks"],
                "mintAmount": item["mint_amount"],
                "stabilizationBlocks": item["stabilization_blocks"],
                "craftDurationBlocks": item["craft_duration_blocks"],
                "halvingIntervalBlocks": item["halving_interval_blocks"],
                "landPrice": item["land_price"],
            }
        )

    def _read_me_from_indexer(self, role_wallet: str) -> Dict[str, Any]:
        payload = self.indexer.get_role_by_wallet(role_wallet)
        position = payload.get("position") or {}
        stats = payload.get("stats") or {}
        action = payload.get("action") or {}
        balance = payload.get("balance") or {}
        identity = decode_role_identity(
            {
                "isValidRole": payload.get("is_valid_role_wallet"),
                "roleId": payload.get("role_id"),
                "owner": payload.get("owner_address"),
                "controller": payload.get("controller_address"),
            }
        )
        role_snapshot = decode_role_snapshot(
            {
                "exists": payload.get("exists"),
                "state": payload.get("state"),
                "x": position.get("x", 0),
                "y": position.get("y", 0),
                "speed": stats.get("speed", 0),
                "attack": stats.get("attack", 0),
                "defense": stats.get("defense", 0),
                "hp": stats.get("hp", 0),
                "maxHp": stats.get("max_hp", 0),
                "range": stats.get("range", 0),
                "mp": stats.get("mp", 0),
            }
        )
        action_snapshot = decode_role_action_snapshot(
            {
                "craftingStartBlock": action.get("crafting_start_block", 0),
                "craftingRequiredBlocks": action.get("crafting_required_blocks", 0),
                "craftingRecipeId": action.get("crafting_recipe_id", 0),
                "learningStartBlock": action.get("learning_start_block", 0),
                "learningRequiredBlocks": action.get("learning_required_blocks", 0),
                "learningTargetId": action.get("learning_target_id", 0),
                "learningSkillId": action.get("learning_skill_id", 0),
                "learningIsNPC": action.get("learning_is_npc", False),
                "learningTeacherWallet": action.get("learning_teacher_wallet"),
                "teachingStartBlock": action.get("teaching_start_block", 0),
                "teachingRequiredBlocks": action.get("teaching_required_blocks", 0),
                "teachingSkillId": action.get("teaching_skill_id", 0),
                "teachingStudentWallet": action.get("teaching_student_wallet"),
                "teleportStartBlock": action.get("teleport_start_block", 0),
                "teleportRequiredBlocks": action.get("teleport_required_blocks", 0),
                "teleportTargetX": action.get("teleport_target_x", 0),
                "teleportTargetY": action.get("teleport_target_y", 0),
                "gatheringStartBlock": action.get("gathering_start_block", 0),
                "gatheringRequiredBlocks": action.get("gathering_required_blocks", 0),
                "gatheringTargetLandId": action.get("gathering_target_land_id", 0),
                "gatheringAmount": action.get("gathering_amount", 0),
            }
        )
        balances = decode_economy_balances(
            {
                "totalBalance": balance.get("agc_balance", 0),
                "unreliableBalance": balance.get("unreliable_agc_balance", 0),
                "reliableBalance": balance.get("reliable_agc_balance", 0),
            }
        )
        return {
            "identity": identity,
            "role": role_snapshot,
            "action": action_snapshot,
            "balances": balances,
            "equipped": [
                {
                    "slot": int(item.get("slot") or 0),
                    "equipmentId": int(item.get("equipment_id") or 0),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in payload.get("equipments") or []
                if int(item.get("equipment_id") or 0) > 0
            ],
            "resourceBalances": [
                {
                    "tokenId": int(item.get("token_id") or 0),
                    "amount": int(item.get("amount") or 0),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in payload.get("resource_balances") or []
                if int(item.get("amount") or 0) > 0
            ],
            "ownedUnequippedEquipments": [
                {
                    "equipmentId": int(item.get("equipment_id") or 0),
                    "amount": int(item.get("amount") or 0),
                    "slot": int(item.get("slot") or 0),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in payload.get("owned_unequipped_equipments") or []
                if int(item.get("amount") or 0) > 0
            ],
            "skills": [
                {
                    "skillId": int(item.get("skill_id") or 0),
                    "learned": bool(item.get("learned")),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in payload.get("skills") or []
            ],
        }

    def _read_land_from_indexer(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if payload.get("landId") is not None:
            item = self.indexer.get_land_by_id(payload["landId"])
        elif payload.get("x") is not None and payload.get("y") is not None:
            result = self.indexer.get_land_by_coordinate(payload["x"], payload["y"])
            item = result["items"][0] if result.get("items") else None
        else:
            raise precheck_error("MISSING_LAND_SELECTOR", "Provide landId or both x and y")
        if not item:
            raise precheck_error("LAND_NOT_FOUND", "Land was not found")
        return decode_land_snapshot(
            {
                "landId": item["land_id"],
                "x": item["x"],
                "y": item["y"],
                "owner": item["owner_address"],
                "landContractAddress": item["land_contract_address"],
                "isResourcePoint": item["is_resource_point"],
                "resourceType": item["resource_type"],
                "stock": item["stock"],
                "groundTokens": item["ground_tokens"],
            }
        )

    def read_core_contracts(self, *, source: Optional[str] = None) -> Dict[str, Any]:
        selected_source = self._select_read_source(source, indexer_supported=True)
        if selected_source == "indexer":
            try:
                data = self._read_core_contracts_from_indexer()
            except AgentboxSkillError:
                if source == "indexer":
                    raise
                data = decode_core_contracts(self.core.call("getCoreContracts"))
        else:
            data = decode_core_contracts(self.core.call("getCoreContracts"))
        return success_result("agentbox.read.core_contracts", "Loaded core contract addresses", data=data)

    def read_global_config(self, *, source: Optional[str] = None) -> Dict[str, Any]:
        selected_source = self._select_read_source(source, indexer_supported=True)
        if selected_source == "indexer":
            try:
                data = self._read_global_config_from_indexer()
            except AgentboxSkillError:
                if source == "indexer":
                    raise
                data = decode_global_config(self.core.call("getGlobalConfig"))
        else:
            data = decode_global_config(self.core.call("getGlobalConfig"))
        return success_result("agentbox.read.global_config", "Loaded global configuration", data=data)

    def read_me(self, role_wallet: str, *, source: Optional[str] = None) -> Dict[str, Any]:
        selected_source = self._select_read_source(source, indexer_supported=True)
        if selected_source == "indexer":
            try:
                data = self._read_me_from_indexer(role_wallet)
            except AgentboxSkillError:
                if source == "indexer":
                    raise
                data = None
        else:
            data = None
        if data is None:
            identity = decode_role_identity(self.core.call("getRoleIdentity", role_wallet))
            role_snapshot = decode_role_snapshot(self.core.call("getRoleSnapshot", role_wallet))
            action_snapshot = decode_role_action_snapshot(self.core.call("getRoleActionSnapshot", role_wallet))
            balances = decode_economy_balances(self.core.call("getEconomyBalances", role_wallet))
            equipped_batch = self.read_role_equipped(
                role_wallet,
                DEFAULT_ROLE_EQUIPMENT_SLOTS,
                source="chain",
            )["data"]["equipped"]
            resource_balances = self.read_role_resource_balances(
                role_wallet,
                DEFAULT_ROLE_RESOURCE_TOKEN_IDS,
                source="chain",
            )["data"]["balances"]
            data = {
                "identity": identity,
                "role": role_snapshot,
                "action": action_snapshot,
                "balances": balances,
                "equipped": [
                    {"slot": slot, "equipmentId": int(equipment_id)}
                    for slot, equipment_id in zip(DEFAULT_ROLE_EQUIPMENT_SLOTS, equipped_batch)
                    if int(equipment_id) > 0
                ],
                "resourceBalances": [
                    {"tokenId": item["tokenId"], "amount": item["amount"]}
                    for item in resource_balances
                    if int(item.get("amount") or 0) > 0
                ],
                "ownedUnequippedEquipments": [],
                "skills": [],
            }
        return success_result(
            "agentbox.read.me",
            "Loaded role identity, snapshot, action state, balances, and owned role assets",
            data=data,
        )

    def read_role_skills(self, role_wallet: str, skill_ids: List[int], *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        skills = self.core.call("getRoleSkills", role_wallet, skill_ids)
        return success_result("agentbox.read.role.skills", "Loaded role skill states", data={"role": role_wallet, "skillIds": skill_ids, "skills": skills})

    def read_role_equipped(self, role_wallet: str, slots: List[int], *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        equipped = self.core.call("getEquippedBatch", role_wallet, slots)
        return success_result("agentbox.read.role.equipped", "Loaded equipped slot data", data={"role": role_wallet, "slots": slots, "equipped": equipped})

    def read_role_resource_balances(self, role_wallet: str, token_ids: List[int], *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        accounts = [role_wallet for _ in token_ids]
        balances = self.resource.call("balanceOfBatch", accounts, token_ids)
        return success_result(
            "agentbox.read.role.resources",
            "Loaded role resource balances",
            data={
                "role": role_wallet,
                "tokenIds": token_ids,
                "balances": [
                    {"tokenId": int(token_id), "amount": int(amount)}
                    for token_id, amount in zip(token_ids, balances)
                ],
            },
        )

    def read_land(self, payload: Dict[str, Any], *, source: Optional[str] = None) -> Dict[str, Any]:
        selected_source = self._select_read_source(source, indexer_supported=True)
        if selected_source == "indexer":
            try:
                snapshot = self._read_land_from_indexer(payload)
            except AgentboxSkillError:
                if source == "indexer":
                    raise
                snapshot = None
        else:
            snapshot = None
        if snapshot is None:
            if payload.get("landId") is not None:
                snapshot = decode_land_snapshot(self.core.call("getLandSnapshotById", payload["landId"]))
            elif payload.get("x") is not None and payload.get("y") is not None:
                snapshot = decode_land_snapshot(self.core.call("getLandSnapshot", payload["x"], payload["y"]))
            else:
                raise precheck_error("MISSING_LAND_SELECTOR", "Provide landId or both x and y")
        return success_result("agentbox.read.land", "Loaded land snapshot", data=snapshot)

    def read_npc(self, npc_id: int, *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        return success_result("agentbox.read.npc", "Loaded NPC snapshot", data=decode_npc_snapshot(self.core.call("getNpcSnapshot", npc_id)))

    def read_recipe(self, recipe_id: int, *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        return success_result("agentbox.read.recipe", "Loaded recipe snapshot", data=decode_recipe_snapshot(self.core.call("getRecipeSnapshot", recipe_id)))

    def read_equipment(self, equipment_id: int, *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        return success_result("agentbox.read.equipment", "Loaded equipment snapshot", data=decode_equipment_snapshot(self.core.call("getEquipmentSnapshot", equipment_id)))

    def read_action_finishable(self, role_wallet: str, *, source: Optional[str] = None) -> Dict[str, Any]:
        self._select_read_source(source, indexer_supported=False)
        return success_result("agentbox.read.action.finishable", "Loaded current action completion status", data=decode_finishable(self.core.call("canFinishCurrentAction", role_wallet)))

    def read_role_snapshot(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.read_role_snapshot",
            "Loaded role snapshot grouped into staticInfo and dynamicInfo",
            data=self.world_info_builder.build_role_snapshot(role_wallet),
        )

    def read_world_static_info(self, role_wallet: str) -> Dict[str, Any]:
        payload = self.world_info_builder.build_world_info(role_wallet)
        return success_result(
            "agentbox.skills.read_world_static_info",
            "Loaded world static info",
            data=payload.get("staticInfo") or {},
        )

    def read_world_dynamic_info(self, role_wallet: str) -> Dict[str, Any]:
        payload = self.world_info_builder.build_world_info(role_wallet)
        return success_result(
            "agentbox.skills.read_world_dynamic_info",
            "Loaded world dynamic info",
            data=payload.get("dynamicInfo") or {},
        )

    def read_nearby_roles(self, role_wallet: str) -> Dict[str, Any]:
        payload = self.world_info_builder.build_world_info(role_wallet)
        dynamic = payload.get("dynamicInfo") or {}
        return success_result(
            "agentbox.skills.read_nearby_roles",
            "Loaded nearby roles",
            data={"items": dynamic.get("nearby_roles") or []},
        )

    def read_nearby_lands(self, role_wallet: str) -> Dict[str, Any]:
        payload = self.world_info_builder.build_world_info(role_wallet)
        dynamic = payload.get("dynamicInfo") or {}
        return success_result(
            "agentbox.skills.read_nearby_lands",
            "Loaded nearby lands",
            data={"items": dynamic.get("nearby_lands") or []},
        )

    def read_last_mint(self) -> Dict[str, Any]:
        if self.indexer is None:
            raise precheck_error("INDEXER_NOT_CONFIGURED", "INDEXER_BASE_URL is required for this read")
        payload = self.indexer.get_last_mint()
        return success_result(
            "agentbox.skills.read_last_mint",
            "Loaded last mint event from the indexer",
            data=payload.get("item"),
        )

    def read_lands_with_ground_tokens(self) -> Dict[str, Any]:
        if self.indexer is None:
            raise precheck_error("INDEXER_NOT_CONFIGURED", "INDEXER_BASE_URL is required for this read")
        items: List[Dict[str, Any]] = []
        offset = 0
        while True:
            payload = self.indexer.list_lands(limit=200, offset=offset, has_ground_tokens=True)
            page_items = payload.get("items") or []
            if not page_items:
                break
            items.extend(page_items)
            if len(page_items) < 200:
                break
            offset += 200
        return success_result(
            "agentbox.skills.read_lands_with_ground_tokens",
            "Loaded lands with ground tokens from the indexer",
            data={"items": items},
        )

    def read_id_mappings(self) -> Dict[str, Any]:
        try:
            payload = json.loads(ID_MAPPINGS_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise precheck_error("ID_MAPPINGS_NOT_FOUND", "Bundled id-mappings.json was not found") from exc
        except json.JSONDecodeError as exc:
            raise precheck_error("ID_MAPPINGS_INVALID", "Bundled id-mappings.json is invalid") from exc
        return success_result(
            "agentbox.skills.read_id_mappings",
            "Loaded bundled Agentbox ID mappings",
            data=payload,
        )

    def move_instant(self, role_wallet: str, x: int, y: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.move.instant",
            "moveTo",
            [role_wallet, x, y],
            "Instant movement transaction submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def teleport_start(self, role_wallet: str, x: int, y: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.teleport.start",
            "startTeleport",
            [role_wallet, x, y],
            "Teleport started",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def finish_current_action(self, role_wallet: str) -> Dict[str, Any]:
        finishable = self.read_action_finishable(role_wallet, source="chain")["data"]
        state = normalize_role_state(finishable.get("state"))
        if state == ROLE_STATE_LEARNING:
            return self.learn_finish(role_wallet)
        if state == ROLE_STATE_CRAFTING:
            return self.core_write(
                "agentbox.skills.craft.finish",
                "finishCrafting",
                [role_wallet],
                "Crafting completed",
                role_wallet=role_wallet,
                allowed_states={ROLE_STATE_CRAFTING},
                finishable=True,
            )
        if state == ROLE_STATE_GATHERING:
            return self.core_write(
                "agentbox.skills.gather.finish",
                "finishGather",
                [role_wallet],
                "Gathering completed",
                role_wallet=role_wallet,
                allowed_states={ROLE_STATE_GATHERING},
                finishable=True,
            )
        if state == ROLE_STATE_TELEPORTING:
            return self.core_write(
                "agentbox.skills.teleport.finish",
                "finishTeleport",
                [role_wallet],
                "Teleport completed",
                role_wallet=role_wallet,
                allowed_states={ROLE_STATE_TELEPORTING},
                finishable=True,
            )
        raise precheck_error("FINISH_NOT_SUPPORTED", "Current finishable state is not mapped to a finish action", {"state": state})

    def gather_start(self, role_wallet: str, amount: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.gather.start",
            "startGather",
            [role_wallet, amount],
            "Gathering started",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def learn_npc_start(self, role_wallet: str, npc_id: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.learn.npc.start",
            "startLearning",
            [role_wallet, npc_id],
            "NPC learning started",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def learn_player_request(self, role_wallet: str, teacher_wallet: str, skill_id: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.learn.player.request",
            "requestLearningFromPlayer",
            [role_wallet, teacher_wallet, skill_id],
            "Player learning request submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
            target_wallet=teacher_wallet,
        )

    def learn_player_accept(self, role_wallet: str, student_wallet: str) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.learn.player.accept",
            "acceptTeaching",
            [role_wallet, student_wallet],
            "Teaching acceptance submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
            target_wallet=student_wallet,
        )

    def craft_start(self, role_wallet: str, recipe_id: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.craft.start",
            "startCrafting",
            [role_wallet, recipe_id],
            "Crafting started",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def attack(self, role_wallet: str, target_wallet: str) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.combat.attack",
            "attack",
            [role_wallet, target_wallet],
            "Attack submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
            target_wallet=target_wallet,
        )

    def equip_put_on(self, role_wallet: str, equipment_id: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.equip.put_on",
            "equip",
            [role_wallet, equipment_id],
            "Equip transaction submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def equip_take_off(self, role_wallet: str, slot: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.equip.take_off",
            "unequip",
            [role_wallet, slot],
            "Unequip transaction submitted",
            role_wallet=role_wallet,
            allowed_states={ROLE_STATE_IDLE},
        )

    def buy_land(self, role_wallet: str, x: int, y: int) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.land.buy",
            "buyLand",
            [role_wallet, x, y],
            "Buy land transaction submitted",
            role_wallet=role_wallet,
            land_xy=(x, y),
        )

    def set_land_contract(self, role_wallet: str, x: int, y: int, contract_address: str) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.land.set_contract",
            "setLandContract",
            [role_wallet, x, y, contract_address],
            "Set land contract transaction submitted",
            role_wallet=role_wallet,
            land_xy=(x, y),
        )

    def send_direct_message(self, role_wallet: str, to_wallet: str, message: str) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.social.dm",
            "sendMessage",
            [role_wallet, to_wallet, message],
            "Direct message sent",
            role_wallet=role_wallet,
            target_wallet=to_wallet,
        )

    def send_global_message(self, role_wallet: str, message: str) -> Dict[str, Any]:
        return self.core_write(
            "agentbox.skills.social.global",
            "sendGlobalMessage",
            [role_wallet, message],
            "Global message sent",
            role_wallet=role_wallet,
        )

    def cancel_current_action(self, role_wallet: str) -> Dict[str, Any]:
        me = self.read_me(role_wallet, source="auto")["data"]
        state = int((me.get("role") or {}).get("state") or -1)
        if state == ROLE_STATE_LEARNING:
            return self.core_write(
                "agentbox.skills.learn.cancel",
                "cancelLearning",
                [role_wallet],
                "Learning cancelled",
                role_wallet=role_wallet,
                allowed_states={ROLE_STATE_LEARNING},
            )
        if state == ROLE_STATE_TEACHING:
            return self.core_write(
                "agentbox.skills.teach.cancel",
                "cancelTeaching",
                [role_wallet],
                "Teaching cancelled",
                role_wallet=role_wallet,
                allowed_states={ROLE_STATE_TEACHING},
            )
        raise precheck_error("CANCEL_NOT_SUPPORTED", "Current state does not support cancel", {"state": state})

    def trigger_mint(self) -> Dict[str, Any]:
        return self.economy_write(
            "agentbox.skills.trigger_mint",
            "triggerMint",
            [],
            "Mint trigger submitted",
        )

    def check_finishable(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.check_finishable",
            "Checked finishability of the current action",
            data=self.action_support.check_finishable(role_wallet),
        )

    def check_gather_prerequisites(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.check_gather_prerequisites",
            "Checked gather prerequisites",
            data=self.action_support.check_gather_prerequisites(role_wallet),
        )

    def check_learning_prerequisites(self, role_wallet: str, npc_id: int) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.check_learning_prerequisites",
            "Checked learning prerequisites",
            data=self.action_support.check_learning_prerequisites(role_wallet, npc_id),
        )

    def check_crafting_prerequisites(self, role_wallet: str, recipe_id: int) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.check_crafting_prerequisites",
            "Checked crafting prerequisites",
            data=self.action_support.check_crafting_prerequisites(role_wallet, recipe_id),
        )

    def check_trigger_mint_prerequisites(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.check_trigger_mint_prerequisites",
            "Checked trigger-mint prerequisites",
            data=self.action_support.check_trigger_mint_prerequisites(role_wallet),
        )

    def summarize_role_state(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.summarize_role_state",
            "Summarized current role state",
            data=self.action_support.summarize_role_state(role_wallet),
        )

    def summarize_world_static_info(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.summarize_world_static_info",
            "Summarized world static info",
            data=self.action_support.summarize_world_static_info(role_wallet),
        )

    def summarize_world_dynamic_info(self, role_wallet: str) -> Dict[str, Any]:
        return success_result(
            "agentbox.skills.summarize_world_dynamic_info",
            "Summarized world dynamic info",
            data=self.action_support.summarize_world_dynamic_info(role_wallet),
        )

    def _refresh_active_signer(self) -> None:
        self.signer_record, self.signer = self.signers.load_active_account()

    def _require_default_signer(self) -> LocalAccount:
        if self.signer is None:
            raise precheck_error("MISSING_SIGNER", "A local signer is required for this action")
        return self.signer

    def _signer_payload(self) -> Dict[str, Any]:
        self._refresh_active_signer()
        if self.signer_record is None:
            return {"hasSigner": False, "signer": None}
        return {
            "hasSigner": True,
            "signer": {
                "signerId": self.signer_record.signer_id,
                "address": self.signer_record.address,
                "label": self.signer_record.label,
                "balanceEth": self._format_eth(int(self.web3.eth.get_balance(self.signer_record.address))),
                "hasPrivateKey": self.signer is not None,
            },
        }

    def _format_eth(self, amount_wei: int) -> str:
        return str(self.web3.from_wei(amount_wei, "ether"))

    def _runtime_state_update(self, **updates: Any) -> None:
        state_store = getattr(getattr(self, "auto_control_plane", None), "state_store", None)
        if state_store is None:
            return
        try:
            state = state_store.load_runtime_state()
            for key, value in updates.items():
                setattr(state, key, value)
            state_store.save_runtime_state(state)
        except Exception:
            pass

    def _active_signer_summary(self) -> Optional[Dict[str, Any]]:
        self._refresh_active_signer()
        if self.signer_record is None:
            return None
        return {
            "signerId": self.signer_record.signer_id,
            "address": self.signer_record.address,
            "label": self.signer_record.label,
            "balanceEth": self._format_eth(int(self.web3.eth.get_balance(self.signer_record.address))),
        }

    def _validate_role_profile_inputs(self, nickname: Optional[str] = None, gender: Optional[int] = None) -> None:
        if nickname is None and gender is None:
            return
        if nickname is None or gender is None:
            raise precheck_error("INCOMPLETE_PROFILE", "nickname and gender must be provided together")
        nickname_length = len(nickname)
        if nickname_length < 3 or nickname_length > 24:
            raise precheck_error("INVALID_NICKNAME_LENGTH", "nickname length must be between 3 and 24 characters")
        if gender > 2:
            raise precheck_error("INVALID_GENDER", "gender must be 0, 1, or 2")

    def _create_character_function(self, nickname: Optional[str] = None, gender: Optional[int] = None):
        self._validate_role_profile_inputs(nickname=nickname, gender=gender)
        if nickname is None:
            return self.core.contract.functions.createCharacter()
        return self.core.contract.functions.createCharacter(nickname, gender)

    def _nickname_available(self, nickname: str) -> bool:
        owner = self.core.call("getRoleWalletByNickname", nickname)
        return owner in {None, "", ZERO_ADDRESS}

    def _generate_registration_profile(self) -> Tuple[str, int]:
        generator = random.SystemRandom()
        for _ in range(12):
            nickname = f"agentbox{generator.randrange(100000, 1000000)}"
            if self._nickname_available(nickname):
                return nickname, generator.randrange(0, 3)
        raise AgentboxSkillError("PRECHECK_NICKNAME_UNAVAILABLE", "Unable to generate an available nickname", retryable=True)

    def _resolve_registration_profile(
        self,
        *,
        profile_mode: Optional[str] = None,
        nickname: Optional[str] = None,
        gender: Optional[int] = None,
    ) -> Tuple[Optional[str], Optional[int]]:
        if profile_mode is not None and profile_mode not in {"manual", "skip", "auto_generate"}:
            raise precheck_error("INVALID_PROFILE_MODE", "profileMode must be manual, skip, or auto_generate")
        if profile_mode == "skip":
            return None, None
        if profile_mode == "auto_generate":
            return self._generate_registration_profile()
        if profile_mode == "manual":
            self._validate_role_profile_inputs(nickname=nickname, gender=gender)
            return nickname, gender

        self._validate_role_profile_inputs(nickname=nickname, gender=gender)
        return nickname, gender

    def _top_up_result(
        self,
        deposit_address: str,
        current_balance_wei: int,
        required_balance_wei: int,
        *,
        role_id: Optional[int] = None,
        role_wallet: Optional[str] = None,
        tx_hash: Optional[str] = None,
        block_number: Optional[int] = None,
        stage: str,
        threshold_kind: str = "registration",
    ) -> Dict[str, Any]:
        shortfall_wei = max(required_balance_wei - current_balance_wei, 0)
        threshold_name = "MIN_NATIVE_BALANCE_ETH" if threshold_kind == "registration" else "AUTO_MIN_OWNER_BALANCE_ETH"
        data = {
            "depositAddress": deposit_address,
            "requiredBalanceEth": self._format_eth(required_balance_wei),
            "currentBalanceEth": self._format_eth(current_balance_wei),
            "shortfallEth": self._format_eth(shortfall_wei),
            "reason": "insufficient_gas",
            "registrationStatus": "awaiting_topup",
            "registrationStage": stage,
            "thresholdKind": threshold_kind,
            "thresholdName": threshold_name,
            "message": f"Please send at least {self._format_eth(shortfall_wei)} more ETH to satisfy {threshold_name}.",
        }
        if role_id is not None:
            data["roleId"] = role_id
        if role_wallet is not None:
            data["role"] = role_wallet
        return success_result(
            "agentbox.registration.confirm",
            "Active signer needs more ETH before registration can continue",
            data=data,
            tx_hash=tx_hash,
            chain_id=self.settings.chain_id,
            block_number=block_number,
        )

    def _resolve_registration_stage(self, role_wallet: str) -> Tuple[str, str]:
        snapshot = decode_role_snapshot(self.core.call("getRoleSnapshot", role_wallet))
        if snapshot["state"] == ROLE_STATE_PENDING_SPAWN:
            return "role_created", "pending_spawn"
        return "spawn_completed", "spawn_completed"

    def _recover_owned_role(self, owner_address: str) -> Optional[Tuple[int, str]]:
        balance = int(self.role.call("balanceOf", owner_address))
        if balance <= 0:
            return None
        role_id = int(self.role.call("tokenOfOwnerByIndex", owner_address, balance - 1))
        role_wallet = self.role.call("wallets", role_id)
        return role_id, role_wallet

    def registration_confirm(
        self,
        *,
        profile_mode: Optional[str] = None,
        nickname: Optional[str] = None,
        gender: Optional[int] = None,
    ) -> Dict[str, Any]:
        signer = self._require_default_signer()
        self._runtime_state_update(
            registration_phase="registration_confirming",
            status="awaiting_registration",
            worker_status="idle",
        )
        nickname, gender = self._resolve_registration_profile(
            profile_mode=profile_mode,
            nickname=nickname,
            gender=gender,
        )
        recovered_role = self._recover_owned_role(signer.address)
        if recovered_role is not None:
            role_id, role_wallet = recovered_role
            registration_status, registration_stage = self._resolve_registration_stage(role_wallet)
            self._remember_registered_role(role_id, role_wallet)
            current_balance_wei = int(self.web3.eth.get_balance(signer.address))
            minimum_owner_balance_wei = self.settings.auto_min_owner_balance_wei()
            if current_balance_wei < minimum_owner_balance_wei:
                self._runtime_state_update(
                    registration_phase="registration_completed",
                    signer_phase="signer_ready",
                    status="awaiting_goal",
                    worker_status="idle",
                )
                return self._top_up_result(
                    signer.address,
                    current_balance_wei,
                    minimum_owner_balance_wei,
                    role_id=role_id,
                    role_wallet=role_wallet,
                    stage="after_registration",
                    threshold_kind="owner_auto",
                )
            self._runtime_state_update(
                registration_phase="registration_completed",
                signer_phase="signer_ready",
                status="awaiting_goal",
                worker_status="idle",
            )
            active_signer = self._active_signer_summary()
            return success_result(
                "agentbox.registration.confirm",
                "Recovered registration state from chain",
                data={
                    "depositAddress": signer.address,
                    "registrationStatus": registration_status,
                    "registrationStage": registration_stage,
                    "roleId": role_id,
                    "role": role_wallet,
                    "activeSigner": active_signer,
                    "activeSignerBalanceEth": None if active_signer is None else active_signer["balanceEth"],
                },
            )

        current_balance_wei = int(self.web3.eth.get_balance(signer.address))
        minimum_balance_wei = self.settings.minimum_native_balance_wei()
        if current_balance_wei < minimum_balance_wei:
            self._runtime_state_update(registration_phase="registration_awaiting_funding", signer_phase="signer_ready")
            return self._top_up_result(
                signer.address,
                current_balance_wei,
                minimum_balance_wei,
                stage="before_role_create",
            )

        create_required_wei = estimate_required_balance(
            self.web3,
            self.settings,
            self._create_character_function(nickname=nickname, gender=gender),
            sender=signer.address,
            value=self.settings.registration_value_wei(),
        )
        create_required_wei = max(create_required_wei, self.settings.minimum_native_balance_wei())
        current_balance_wei = int(self.web3.eth.get_balance(signer.address))
        if current_balance_wei < create_required_wei:
            self._runtime_state_update(registration_phase="registration_awaiting_funding", signer_phase="signer_ready")
            return self._top_up_result(
                signer.address,
                current_balance_wei,
                create_required_wei,
                stage="before_role_create",
            )

        created = self.role_create(account=signer, nickname=nickname, gender=gender)
        created_data = dict(created["data"])
        created_data.update(
            {
                "depositAddress": signer.address,
                "currentBalanceEth": self._format_eth(int(self.web3.eth.get_balance(signer.address))),
                "registrationStatus": "role_created",
            }
        )
        self._remember_registered_role(created["data"]["roleId"], created["data"]["role"])
        self._runtime_state_update(
            registration_phase="registration_completed",
            signer_phase="signer_ready",
            status="awaiting_goal",
            worker_status="idle",
        )
        active_signer = self._active_signer_summary()
        created_data["activeSigner"] = active_signer
        created_data["activeSignerBalanceEth"] = None if active_signer is None else active_signer["balanceEth"]
        return success_result(
            "agentbox.registration.confirm",
            "Registration confirmed with the active signer",
            data=created_data,
            tx_hash=created["txHash"],
            chain_id=created.get("chainId"),
            block_number=created.get("blockNumber"),
        )

    def _remember_registered_role(self, role_id: int, role_wallet: str) -> None:
        state_store = getattr(getattr(self, "auto_control_plane", None), "state_store", None)
        if state_store is None:
            return
        try:
            state = state_store.load_runtime_state()
            state.role_id = role_id
            state.role = role_wallet
            state_store.save_runtime_state(state)
        except Exception:
            pass

    def role_create(
        self,
        *,
        account: Optional[LocalAccount] = None,
        nickname: Optional[str] = None,
        gender: Optional[int] = None,
    ) -> Dict[str, Any]:
        signer = account or self._require_default_signer()
        contract_function = self._create_character_function(nickname=nickname, gender=gender)
        tx = send_transaction(
            self.web3,
            self.settings,
            contract_function,
            value=self.settings.registration_value_wei(),
            account=signer,
        )
        receipt = tx["receipt"]
        role_id = None
        role_wallet = None
        try:
            logs = self.role.contract.events.WalletCreated().process_receipt(receipt)
            if logs:
                role_id = int(logs[0]["args"]["roleId"])
                role_wallet = logs[0]["args"]["wallet"]
        except Exception:
            role_id = None
            role_wallet = None
        if role_id is None:
            raise AgentboxSkillError("TX_ROLE_CREATE_PARSE", "Unable to parse role creation receipt", retryable=False)
        return success_result(
            "agentbox.role.create",
            "Role NFT and role entity created; spawn is still pending",
            data={
                "roleId": role_id,
                "role": role_wallet,
                "registrationStage": "pending_spawn",
                "nickname": nickname,
                "gender": gender,
            },
            tx_hash=tx["txHash"],
            chain_id=self.settings.chain_id,
            block_number=tx["blockNumber"],
        )

    def role_controller_set(self, role_id: int, controller: str) -> Dict[str, Any]:
        signer = self._require_default_signer()
        self.precheck.validate_address(controller, "controller")
        owner = self.role.call("ownerOf", role_id)
        if self.web3.to_checksum_address(owner) != self.web3.to_checksum_address(signer.address):
            raise precheck_error("NOT_ROLE_OWNER", "Signer is not the owner of the role", {"roleId": role_id, "owner": owner})
        tx = send_transaction(self.web3, self.settings, self.role.contract.functions.setController(role_id, controller), account=signer)
        return success_result(
            "agentbox.role.controller.set",
            "Role controller set",
            data={"roleId": role_id, "controller": controller},
            tx_hash=tx["txHash"],
            chain_id=self.settings.chain_id,
            block_number=tx["blockNumber"],
        )

    def role_controller_clear(self, role_id: int) -> Dict[str, Any]:
        signer = self._require_default_signer()
        owner = self.role.call("ownerOf", role_id)
        if self.web3.to_checksum_address(owner) != self.web3.to_checksum_address(signer.address):
            raise precheck_error("NOT_ROLE_OWNER", "Signer is not the owner of the role", {"roleId": role_id, "owner": owner})
        tx = send_transaction(self.web3, self.settings, self.role.contract.functions.clearController(role_id), account=signer)
        return success_result(
            "agentbox.role.controller.clear",
            "Role controller cleared",
            data={"roleId": role_id},
            tx_hash=tx["txHash"],
            chain_id=self.settings.chain_id,
            block_number=tx["blockNumber"],
        )

    def core_write(
        self,
        action: str,
        method: str,
        args: List[Any],
        summary: str,
        *,
        role_wallet: Optional[str] = None,
        allowed_states: Optional[Set[int]] = None,
        finishable: bool = False,
        target_wallet: Optional[str] = None,
        land_xy: Optional[Tuple[int, int]] = None,
    ) -> Dict[str, Any]:
        signer = self._require_default_signer()
        data: Dict[str, Any] = {}
        if role_wallet is not None:
            data.update(self.precheck.validate_owner_or_controller(role_wallet, signer.address))
            if allowed_states is not None:
                data["roleSnapshot"] = self.precheck.validate_role_state(role_wallet, allowed_states)
        if finishable and role_wallet is not None:
            data["finishable"] = self.precheck.validate_finish_block_ready(role_wallet)
        if target_wallet is not None:
            data["target"] = self.precheck.validate_target_exists(target_wallet)
        if land_xy is not None and role_wallet is not None:
            self.precheck.validate_land_constraints(role_wallet, land_xy[0], land_xy[1])
        tx = send_transaction(self.web3, self.settings, getattr(self.core.contract.functions, method)(*args), account=signer)
        return success_result(action, summary, data=data, tx_hash=tx["txHash"], chain_id=self.settings.chain_id, block_number=tx["blockNumber"])

    def learn_finish(self, role_wallet: str) -> Dict[str, Any]:
        signer = self._require_default_signer()
        data = {
            "roleSnapshot": self.precheck.validate_role_state(role_wallet, {ROLE_STATE_LEARNING}),
            "finishable": self.precheck.validate_finish_block_ready(role_wallet),
        }
        tx = send_transaction(self.web3, self.settings, self.core.contract.functions.finishLearning(role_wallet), account=signer)
        return success_result(
            "agentbox.learn.finish",
            "Learning completed",
            data=data,
            tx_hash=tx["txHash"],
            chain_id=self.settings.chain_id,
            block_number=tx["blockNumber"],
        )

    def economy_write(self, action: str, method: str, args: List[Any], summary: str) -> Dict[str, Any]:
        tx = send_transaction(self.web3, self.settings, getattr(self.economy.contract.functions, method)(*args), account=self._require_default_signer())
        return success_result(action, summary, data={}, tx_hash=tx["txHash"], chain_id=self.settings.chain_id, block_number=tx["blockNumber"])

    def signer_prepare(self, *, label: Optional[str] = None) -> Dict[str, Any]:
        record = self.signers.prepare_signer(label=label)
        self._refresh_active_signer()
        self._runtime_state_update(signer_phase="signer_ready")
        return success_result(
            "agentbox.signer.prepare",
            "Local signer created",
            data={
                "signerId": record.signer_id,
                "address": record.address,
                "label": record.label,
                "signerState": self._signer_payload(),
            },
        )

    def signer_import(self, *, private_key: str, label: Optional[str] = None) -> Dict[str, Any]:
        record = self.signers.import_signer(private_key, label=label)
        self._refresh_active_signer()
        self._runtime_state_update(signer_phase="signer_ready")
        return success_result(
            "agentbox.signer.import",
            "Local signer imported",
            data={
                "signerId": record.signer_id,
                "address": record.address,
                "label": record.label,
                "signerState": self._signer_payload(),
            },
        )

    def signer_export(self) -> Dict[str, Any]:
        record = self.signers.export_signer()
        return success_result(
            "agentbox.signer.export",
            "Local signer private key exported",
            data={
                "signerId": record.signer_id,
                "address": record.address,
                "label": record.label,
                "privateKey": record.private_key,
            },
        )

    def signer_read(self) -> Dict[str, Any]:
        return success_result("agentbox.signer.read", "Loaded signer state", data=self._signer_payload())
