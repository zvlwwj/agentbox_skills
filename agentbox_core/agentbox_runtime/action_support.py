from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from .state import (
    ROLE_STATE_CRAFTING,
    ROLE_STATE_GATHERING,
    ROLE_STATE_IDLE,
    ROLE_STATE_LEARNING,
    ROLE_STATE_TEACHING,
    ROLE_STATE_TELEPORTING,
    normalize_role_state,
)


def _skill_ids(me: Dict[str, Any]) -> set[int]:
    return {
        int(item.get("skillId") or 0)
        for item in me.get("skills") or []
        if bool(item.get("learned"))
    }


def _resource_amounts(me: Dict[str, Any]) -> Dict[int, int]:
    return {
        int(item.get("tokenId") or 0): int(item.get("amount") or 0)
        for item in me.get("resourceBalances") or []
    }


@dataclass
class ActionSupport:
    runtime: Any

    def check_finishable(self, role_wallet: str) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        finishable = self.runtime.read_action_finishable(role_wallet, source="chain")["data"]
        return {
            "role": role_wallet,
            "state": (me.get("role") or {}).get("state"),
            "canFinish": bool(finishable.get("canFinish")),
            "finishBlock": finishable.get("finishBlock"),
            "finishState": finishable.get("state"),
        }

    def check_gather_prerequisites(self, role_wallet: str) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        world = self.runtime.world_info_builder.build_world_info(role_wallet)
        role = me.get("role") or {}
        current_land = ((world.get("dynamicInfo") or {}).get("current_land") or {})
        learned = _skill_ids(me)
        resource_type = int(current_land.get("resourceType") or 0)
        land_is_resource = bool(current_land.get("isResourcePoint"))
        has_stock = int(current_land.get("stock") or 0) > 0
        role_idle = normalize_role_state(role.get("state")) == ROLE_STATE_IDLE
        required_skill_learned = resource_type > 0 and resource_type in learned
        can_start = land_is_resource and has_stock and role_idle and required_skill_learned
        reasons = []
        if not land_is_resource:
            reasons.append("current_land_is_not_resource_point")
        if not has_stock:
            reasons.append("current_land_has_no_stock")
        if not role_idle:
            reasons.append("role_is_not_idle")
        if resource_type <= 0:
            reasons.append("resource_type_missing")
        elif not required_skill_learned:
            reasons.append("required_skill_not_learned")
        return {
            "role": role_wallet,
            "canExecute": can_start,
            "currentLand": current_land,
            "requiredSkillId": resource_type if resource_type > 0 else None,
            "learnedSkillIds": sorted(learned),
            "reasons": reasons,
        }

    def check_learning_prerequisites(self, role_wallet: str, npc_id: int) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        world = self.runtime.world_info_builder.build_world_info(role_wallet)
        role = me.get("role") or {}
        npcs = (world.get("staticInfo") or {}).get("all_npcs") or []
        npc = next((item for item in npcs if int(item.get("npcId") or 0) == int(npc_id)), None)
        learned = _skill_ids(me)
        role_idle = normalize_role_state(role.get("state")) == ROLE_STATE_IDLE
        at_npc = npc is not None and int(role.get("x") or -1) == int(npc.get("x") or -2) and int(role.get("y") or -1) == int(npc.get("y") or -2)
        skill_id = int((npc or {}).get("skillId") or 0)
        can_start = npc is not None and role_idle and at_npc and skill_id > 0 and skill_id not in learned
        reasons = []
        if npc is None:
            reasons.append("npc_not_found")
        if not role_idle:
            reasons.append("role_is_not_idle")
        if npc is not None and not at_npc:
            reasons.append("role_not_at_npc_position")
        if skill_id in learned:
            reasons.append("skill_already_learned")
        return {
            "role": role_wallet,
            "npcId": npc_id,
            "canExecute": can_start,
            "npc": npc,
            "reasons": reasons,
        }

    def check_crafting_prerequisites(self, role_wallet: str, recipe_id: int) -> Dict[str, Any]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        world = self.runtime.world_info_builder.build_world_info(role_wallet)
        role = me.get("role") or {}
        recipes = (world.get("staticInfo") or {}).get("recipe_catalog") or []
        recipe = next((item for item in recipes if int(item.get("recipeId") or 0) == int(recipe_id)), None)
        learned = _skill_ids(me)
        balances = _resource_amounts(me)
        role_idle = normalize_role_state(role.get("state")) == ROLE_STATE_IDLE
        has_skill = recipe is not None and int(recipe.get("requiredSkill") or 0) in learned
        missing_resources: List[Dict[str, int]] = []
        if recipe is not None:
            for token_id, amount in zip(recipe.get("requiredResources") or [], recipe.get("requiredAmounts") or []):
                if balances.get(int(token_id), 0) < int(amount):
                    missing_resources.append({"tokenId": int(token_id), "required": int(amount), "current": balances.get(int(token_id), 0)})
        can_start = recipe is not None and role_idle and has_skill and not missing_resources
        reasons = []
        if recipe is None:
            reasons.append("recipe_not_found")
        if not role_idle:
            reasons.append("role_is_not_idle")
        if recipe is not None and not has_skill:
            reasons.append("required_skill_not_learned")
        if missing_resources:
            reasons.append("missing_resources")
        return {
            "role": role_wallet,
            "recipeId": recipe_id,
            "canExecute": can_start,
            "recipe": recipe,
            "missingResources": missing_resources,
            "reasons": reasons,
        }

    def check_trigger_mint_prerequisites(self, role_wallet: str) -> Dict[str, Any]:
        resolved_role = role_wallet or self.runtime._resolve_default_role()
        if not resolved_role:
            return {
                "canExecute": False,
                "currentBlock": None,
                "mintIntervalBlocks": None,
                "lastMint": None,
                "landsWithGroundTokensCount": None,
                "reasons": ["missing_role"],
            }
        world = self.runtime.world_info_builder.build_world_info(resolved_role)
        static_info = world.get("staticInfo") or {}
        dynamic_info = world.get("dynamicInfo") or {}
        current_block = dynamic_info.get("current_block")
        last_mint = dynamic_info.get("last_mint") or {}
        mint_interval = static_info.get("mint_interval_blocks")
        lands_with_ground_tokens = dynamic_info.get("lands_with_ground_tokens") or []
        no_ground_tokens = len(lands_with_ground_tokens) == 0
        enough_blocks = (
            current_block is not None
            and mint_interval is not None
            and last_mint.get("block_number") is not None
            and int(current_block) - int(last_mint.get("block_number")) >= int(mint_interval)
        )
        can_trigger = no_ground_tokens and enough_blocks
        reasons = []
        if not no_ground_tokens:
            reasons.append("ground_tokens_already_present")
        if not enough_blocks:
            reasons.append("mint_interval_not_elapsed")
        return {
            "canExecute": can_trigger,
            "currentBlock": current_block,
            "mintIntervalBlocks": mint_interval,
            "lastMint": last_mint,
            "landsWithGroundTokensCount": len(lands_with_ground_tokens),
            "reasons": reasons,
        }

    def list_available_actions(self, role_wallet: str) -> List[Dict[str, Any]]:
        me = self.runtime.read_me(role_wallet, source="auto")["data"]
        role = me.get("role") or {}
        state = normalize_role_state(role.get("state"))
        finishable = self.check_finishable(role_wallet)
        items: List[Dict[str, Any]] = []
        if finishable.get("canFinish"):
            items.append({"action": "agentbox.skills.finish_current_action", "reason": "current_action_can_finish"})
        if state == ROLE_STATE_IDLE:
            gather = self.check_gather_prerequisites(role_wallet)
            if gather.get("canExecute"):
                items.append({"action": "agentbox.skills.gather.start", "reason": "standing_on_gatherable_resource_land"})
            world = self.runtime.world_info_builder.build_world_info(role_wallet)
            current_land = ((world.get("dynamicInfo") or {}).get("current_land") or {})
            nearby_lands = (world.get("dynamicInfo") or {}).get("nearby_lands") or []
            for land in nearby_lands:
                if bool(land.get("isResourcePoint")) and int(land.get("stock") or 0) > 0 and (
                    int(land.get("x") or -1) != int(current_land.get("x") or -2)
                    or int(land.get("y") or -1) != int(current_land.get("y") or -2)
                ):
                    items.append({"action": "agentbox.skills.move.instant", "reason": "nearby_resource_land_available", "target": {"x": land.get("x"), "y": land.get("y")}})
                    break
            if self.check_trigger_mint_prerequisites(role_wallet).get("canExecute"):
                items.append({"action": "agentbox.skills.trigger_mint", "reason": "mint_window_open_and_no_ground_tokens"})
        elif state in {ROLE_STATE_LEARNING, ROLE_STATE_TEACHING}:
            items.append({"action": "agentbox.skills.cancel_current_action", "reason": "current_state_supports_cancel"})
        elif state in {ROLE_STATE_CRAFTING, ROLE_STATE_GATHERING, ROLE_STATE_TELEPORTING}:
            items.append({"action": "agentbox.skills.finish_current_action", "reason": "current_state_may_require_finish"})
        return items

    def summarize_role_state(self, role_wallet: str) -> Dict[str, Any]:
        snapshot = self.runtime.world_info_builder.build_role_snapshot(role_wallet)
        dynamic = snapshot.get("dynamicInfo") or {}
        return {
            "role": role_wallet,
            "state": (dynamic.get("role") or {}).get("state"),
            "position": {
                "x": (dynamic.get("role") or {}).get("x"),
                "y": (dynamic.get("role") or {}).get("y"),
            },
            "finishable": dynamic.get("finishable"),
            "balances": dynamic.get("balances"),
            "resourceBalances": dynamic.get("resourceBalances"),
        }

    def summarize_world_static_info(self, role_wallet: str) -> Dict[str, Any]:
        static_info = (self.runtime.world_info_builder.build_world_info(role_wallet).get("staticInfo") or {})
        return {
            "npcCount": len(static_info.get("all_npcs") or []),
            "recipeCount": len(static_info.get("recipe_catalog") or []),
            "equipmentCount": len(static_info.get("equipment_catalog") or {}),
            "resourceLandCount": len(static_info.get("all_resource_lands") or []),
            "mintIntervalBlocks": static_info.get("mint_interval_blocks"),
        }

    def summarize_world_dynamic_info(self, role_wallet: str) -> Dict[str, Any]:
        dynamic_info = (self.runtime.world_info_builder.build_world_info(role_wallet).get("dynamicInfo") or {})
        return {
            "currentBlock": dynamic_info.get("current_block"),
            "currentLand": dynamic_info.get("current_land"),
            "nearbyRoleCount": len(dynamic_info.get("nearby_roles") or []),
            "nearbyLandCount": len(dynamic_info.get("nearby_lands") or []),
            "landsWithGroundTokensCount": len(dynamic_info.get("lands_with_ground_tokens") or []),
            "lastMint": dynamic_info.get("last_mint"),
        }
