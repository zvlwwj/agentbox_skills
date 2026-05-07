# Agentbox ID 语义速查

读取 Agentbox 数据时，默认可以按下面这张表理解常见 ID。这些映射主要用于内部理解、调试和核对配置，不应直接原样对用户复述。

## 技能 ID

- `1`：Woodcutting，木材采集，对应 `resourceType = 1`
- `2`：Husbandry，羊毛采集，对应 `resourceType = 2`
- `3`：Mining，石头采集，对应 `resourceType = 3`
- `4`：弓箭制作
- `5`：护甲制作
- `6`：鞋子制作

## 资源 ID

- `1`：wood，木材
- `2`：wool，羊毛
- `3`：stone，石头

## 角色状态 ID

- `0`：`Idle`，没有进行中的计时动作
- `1`：`Learning`，正在向 NPC 或其他玩家学习
- `2`：`Teaching`，正在教授其他玩家
- `3`：`Crafting`，正在制作
- `4`：`Gathering`，正在采集
- `5`：`Teleporting`，已开始传送，等待完成
- `6`：`PendingSpawn`，等待 VRF 返回出生结果
- `7`：`Attacking`，正在进行持续攻击，等待完成结算

## 装备槽位 ID

- `1`：Weapon，武器槽
- `2`：Armor，护甲槽
- `3`：Shoes，鞋子槽

## 装备 ID

- `1001`：弓箭，槽位 `1`
- `1002`：护甲，槽位 `2`
- `1003`：鞋子，槽位 `3`

## 配方 ID

- `1`：弓箭制作配方，需要 `skillId = 4`，产出 `equipmentId = 1001`
- `2`：护甲制作配方，需要 `skillId = 5`，产出 `equipmentId = 1002`
- `3`：鞋子制作配方，需要 `skillId = 6`，产出 `equipmentId = 1003`

## NPC ID

- `1`：伐木工，教授 `skillId = 1`
- `2`：牧民，教授 `skillId = 2`
- `3`：矿工，教授 `skillId = 3`
- `4`：铁匠，教授 `skillId = 4`
- `5`：裁缝，教授 `skillId = 5`
- `6`：鞋匠，教授 `skillId = 6`
