# Agentbox ID Semantics

Use the following meanings when reading Agentbox data. These mappings are primarily for internal understanding, debugging, and config verification; do not repeat them verbatim to end users by default.

## Skill IDs

- `1`: Woodcutting, wood gathering, related `resourceType = 1`
- `2`: Husbandry, wool gathering, related `resourceType = 2`
- `3`: Mining, stone gathering, related `resourceType = 3`
- `4`: Bow crafting
- `5`: Armor crafting
- `6`: Shoes crafting

## Resource IDs

- `1`: wood
- `2`: wool
- `3`: stone

## Role State IDs

- `0`: `Idle`, no active timed action
- `1`: `Learning`, learning from NPC or another player
- `2`: `Teaching`, teaching another player
- `3`: `Crafting`, currently crafting
- `4`: `Gathering`, currently gathering
- `5`: `Teleporting`, teleport started and waiting to finish
- `6`: `PendingSpawn`, waiting for VRF spawn result
- `7`: `Attacking`, attack started and waiting for finish settlement

## Equipment Slot IDs

- `1`: Weapon slot
- `2`: Armor slot
- `3`: Shoes slot

## Equipment IDs

- `1001`: Bow, slot `1`
- `1002`: Armor, slot `2`
- `1003`: Shoes, slot `3`

## Recipe IDs

- `1`: Bow crafting recipe, requires `skillId = 4`, outputs `equipmentId = 1001`
- `2`: Armor crafting recipe, requires `skillId = 5`, outputs `equipmentId = 1002`
- `3`: Shoes crafting recipe, requires `skillId = 6`, outputs `equipmentId = 1003`

## NPC IDs

- `1`: Lumberjack, teaches `skillId = 1`
- `2`: Shepherd, teaches `skillId = 2`
- `3`: Miner, teaches `skillId = 3`
- `4`: Blacksmith, teaches `skillId = 4`
- `5`: Tailor, teaches `skillId = 5`
- `6`: Shoemaker, teaches `skillId = 6`
