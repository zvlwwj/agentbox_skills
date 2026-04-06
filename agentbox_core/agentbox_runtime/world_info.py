from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


NEARBY_COORDINATE_DELTA = 100
PAGE_SIZE = 200


@dataclass
class WorldInfoBuilder:
    runtime: Any

    def build_role_snapshot(self, role_wallet: str) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        finishable = self.runtime.read_action_finishable(role_wallet, source="chain")["data"]
        static_info = {
            "identity": me.get("identity") or {},
            "skills": list(me.get("skills") or []),
            "equipped": list(me.get("equipped") or []),
            "ownedUnequippedEquipments": list(me.get("ownedUnequippedEquipments") or []),
        }
        dynamic_info = {
            "role": me.get("role") or {},
            "action": me.get("action") or {},
            "balances": me.get("balances") or {},
            "resourceBalances": list(me.get("resourceBalances") or []),
            "finishable": finishable,
        }
        return {
            "role": role_wallet,
            "staticInfo": static_info,
            "dynamicInfo": dynamic_info,
        }

    def build_world_info(self, role_wallet: str) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        role = me.get("role") or {}
        x = role.get("x")
        y = role.get("y")
        world_state: Dict[str, Any] = {
            "available_land_contracts": [],
            "current_equipment": [],
            "current_equipment_recipes": {},
        }
        self._attach_global_config(world_state)
        self._attach_current_block(world_state)
        self._attach_catalogs(world_state)
        self._attach_current_equipment_info(world_state=world_state, me=me)
        self._attach_last_mint(world_state)
        self._attach_ground_token_lands(world_state)
        if x is not None and y is not None:
            self._attach_current_land(world_state, int(x), int(y))
            self._attach_nearby(world_state, role_wallet, int(x), int(y))
        return {
            "staticInfo": {
                "all_npcs": world_state.get("all_npcs") or [],
                "recipe_catalog": world_state.get("recipe_catalog") or [],
                "equipment_catalog": world_state.get("equipment_catalog") or {},
                "all_resource_lands": world_state.get("all_resource_lands") or [],
                "current_equipment": world_state.get("current_equipment") or [],
                "current_equipment_recipes": world_state.get("current_equipment_recipes") or {},
                "available_land_contracts": [],
                "mint_interval_blocks": world_state.get("mint_interval_blocks"),
            },
            "dynamicInfo": {
                "current_block": world_state.get("current_block"),
                "current_land": world_state.get("current_land"),
                "nearby_roles": world_state.get("nearby_roles") or [],
                "nearby_lands": world_state.get("nearby_lands") or [],
                "lands_with_ground_tokens": world_state.get("lands_with_ground_tokens") or [],
                "last_mint": world_state.get("last_mint"),
            },
        }

    def _attach_global_config(self, world_state: Dict[str, Any]) -> None:
        try:
            config = self.runtime.read_global_config(source="auto")["data"]
            world_state["mint_interval_blocks"] = config.get("mintIntervalBlocks")
        except Exception:
            world_state["mint_interval_blocks"] = None

    def _attach_current_block(self, world_state: Dict[str, Any]) -> None:
        try:
            world_state["current_block"] = int(self.runtime.web3.eth.block_number)
        except Exception:
            world_state["current_block"] = None

    def _attach_catalogs(self, world_state: Dict[str, Any]) -> None:
        indexer = getattr(self.runtime, "indexer", None)
        if indexer is None:
            return
        try:
            items = (indexer.list_npc_configs(limit=500, offset=0).get("items") or [])
            world_state["all_npcs"] = [
                {
                    "npcId": int(item.get("npc_id") or 0),
                    "x": item.get("x"),
                    "y": item.get("y"),
                    "skillId": int(item.get("skill_id") or 0),
                    "isTeaching": bool(item.get("is_teaching")),
                    "studentWallet": item.get("student_wallet"),
                    "startBlock": item.get("start_block"),
                }
                for item in items
            ]
        except Exception:
            pass
        try:
            items = (indexer.list_recipe_configs(limit=500, offset=0).get("items") or [])
            world_state["recipe_catalog"] = [
                {
                    "recipeId": int(item.get("recipe_id") or 0),
                    "requiredResources": list(item.get("resource_types") or []),
                    "requiredAmounts": list(item.get("amounts") or []),
                    "requiredSkill": int(item.get("skill_id") or 0),
                    "requiredBlocks": item.get("required_blocks"),
                    "outputEquipmentId": int(item.get("output_equipment_id") or 0),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in items
            ]
        except Exception:
            pass
        try:
            items = (indexer.list_equipment_configs(limit=500, offset=0).get("items") or [])
            world_state["equipment_catalog"] = {
                int(item.get("equipment_id") or 0): {
                    "equipmentId": int(item.get("equipment_id") or 0),
                    "slot": int(item.get("slot") or 0),
                    "speedBonus": item.get("speed_bonus"),
                    "attackBonus": item.get("attack_bonus"),
                    "defenseBonus": item.get("defense_bonus"),
                    "maxHpBonus": item.get("max_hp_bonus"),
                    "rangeBonus": item.get("range_bonus"),
                    "updatedAtBlock": item.get("updated_at_block"),
                }
                for item in items
                if int(item.get("equipment_id") or 0) > 0
            }
        except Exception:
            pass
        try:
            world_state["all_resource_lands"] = self._list_lands(indexer, is_resource_point=True)
        except Exception:
            pass

    def _attach_current_equipment_info(self, *, world_state: Dict[str, Any], me: Dict[str, Any]) -> None:
        equipment_catalog = dict(world_state.get("equipment_catalog") or {})
        equipped = list(me.get("equipped") or [])
        if equipped:
            world_state["current_equipment"] = [
                {
                    "slot": int(item.get("slot") or 0),
                    "equipmentId": int(item.get("equipmentId") or item.get("equipment_id") or 0),
                    "attributes": equipment_catalog.get(int(item.get("equipmentId") or item.get("equipment_id") or 0), {}),
                }
                for item in equipped
                if int(item.get("equipmentId") or item.get("equipment_id") or 0) > 0
            ]
        recipe_catalog = list(world_state.get("recipe_catalog") or [])
        if recipe_catalog:
            by_output: Dict[int, List[Dict[str, Any]]] = {}
            for recipe in recipe_catalog:
                output_id = int(recipe.get("outputEquipmentId") or 0)
                if output_id > 0:
                    by_output.setdefault(output_id, []).append(recipe)
            world_state["current_equipment_recipes"] = {
                str(int(item["equipmentId"])): by_output.get(int(item["equipmentId"]), [])
                for item in world_state.get("current_equipment") or []
            }

    def _attach_last_mint(self, world_state: Dict[str, Any]) -> None:
        indexer = getattr(self.runtime, "indexer", None)
        if indexer is None:
            return
        try:
            world_state["last_mint"] = (indexer.get_last_mint() or {}).get("item")
        except Exception:
            pass

    def _attach_ground_token_lands(self, world_state: Dict[str, Any]) -> None:
        indexer = getattr(self.runtime, "indexer", None)
        if indexer is None:
            return
        try:
            world_state["lands_with_ground_tokens"] = self._list_lands(indexer, has_ground_tokens=True)
        except Exception:
            pass

    def _attach_current_land(self, world_state: Dict[str, Any], x: int, y: int) -> None:
        try:
            world_state["current_land"] = self.runtime.read_land({"x": x, "y": y}, source="auto")["data"]
        except Exception:
            pass

    def _attach_nearby(self, world_state: Dict[str, Any], role_wallet: str, x: int, y: int) -> None:
        indexer = getattr(self.runtime, "indexer", None)
        if indexer is None:
            return
        bounds = {
            "x_min": x - NEARBY_COORDINATE_DELTA,
            "x_max": x + NEARBY_COORDINATE_DELTA,
            "y_min": y - NEARBY_COORDINATE_DELTA,
            "y_max": y + NEARBY_COORDINATE_DELTA,
        }
        try:
            items = (indexer.list_roles(limit=200, offset=0, **bounds).get("items") or [])
            world_state["nearby_roles"] = [
                {
                    "roleId": item.get("role_id"),
                    "roleWallet": item.get("role_wallet"),
                    "ownerAddress": item.get("owner_address"),
                    "controllerAddress": item.get("controller_address"),
                    "x": (item.get("position") or {}).get("x"),
                    "y": (item.get("position") or {}).get("y"),
                    "state": item.get("state"),
                }
                for item in items
                if str(item.get("role_wallet") or "").lower() != str(role_wallet).lower()
            ]
        except Exception:
            pass
        try:
            items = (indexer.list_lands(limit=200, offset=0, **bounds).get("items") or [])
            world_state["nearby_lands"] = [self._normalize_land_item(item) for item in items]
        except Exception:
            pass

    def _list_lands(
        self,
        indexer: Any,
        *,
        is_resource_point: Optional[bool] = None,
        has_ground_tokens: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        offset = 0
        while True:
            payload = indexer.list_lands(
                limit=PAGE_SIZE,
                offset=offset,
                is_resource_point=is_resource_point,
                has_ground_tokens=has_ground_tokens,
            )
            page_items = payload.get("items") or []
            if not page_items:
                break
            items.extend(self._normalize_land_item(item) for item in page_items)
            if len(page_items) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
        return items

    def _normalize_land_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "landId": item.get("land_id"),
            "x": item.get("x"),
            "y": item.get("y"),
            "ownerAddress": item.get("owner_address"),
            "landContractAddress": item.get("land_contract_address"),
            "isResourcePoint": item.get("is_resource_point"),
            "resourceType": item.get("resource_type"),
            "stock": item.get("stock"),
            "groundTokens": item.get("ground_tokens"),
            "updatedAtBlock": item.get("updated_at_block"),
        }
