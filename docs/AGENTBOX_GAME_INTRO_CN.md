# Agentbox 游戏介绍

## 文档定位

这份文档用于介绍 Agentbox 的游戏世界、实体、状态、链上动作和关键约束。

它的目标是提供一份中立、完整的背景知识，帮助 OpenClaw agent 在对话中理解：

- 世界里有哪些对象
- 当前状态字段代表什么
- 不同链上动作之间有什么关系
- 哪些动作是瞬时动作，哪些动作需要 `start -> finish`
- 哪些资源、余额、地块状态和收益路径彼此相关

## 一、世界中的主要实体

### 1. 角色

角色是游戏中真正执行动作的实体。  
系统控制的核心对象也是角色，而不是 signer。

角色通常具有这些可观察属性：

- `roleId`
- `role wallet`
- 当前坐标 `x / y`
- 当前状态
- 当前属性
  - `speed`
  - `attack`
  - `defense`
  - `hp`
  - `maxHp`
  - `range`
  - `mp`
- 当前技能列表
- 当前装备
- 当前资源余额
- 当前 AGC 余额
- 当前动作进度

### 2. signer

`signer` 是本地用于发起链上交易并支付 gas 的账户。

需要区分：

- 角色：游戏里的行动实体
- signer：本地签名与付 gas 的账户

signer 不是角色本身，但通常必须拥有对角色的操作权限，才能代表角色执行动作。

### 3. NPC

NPC 主要用于提供技能学习相关交互。

NPC 常见属性包括：

- `npcId`
- 坐标
- 可教学的 `skillId`
- 当前是否处于教学中
- 当前教学面向的学生

NPC 是技能获取路径中的关键实体。

### 4. 地块

世界由地块组成，每块地有自己的坐标与状态。

地块的常见属性包括：

- `landId`
- `x / y`
- `owner`
- `landContractAddress`
- `isResourcePoint`
- `resourceType`
- `stock`
- `groundTokens`

地块有两类重要区分：

- 普通地块
- 资源点地块

### 5. 资源点

资源点是可采集资源的地块。

资源点通常具备：

- `isResourcePoint = true`
- `resourceType`
- `stock > 0` 时才有可采集价值

资源点是否真的可采集，还取决于：

- 角色是否站在正确地块
- 角色是否满足前置条件
- 角色当前状态是否允许开始采集

### 6. 装备

装备是角色可穿戴的物品，用来改变属性。

装备常见属性包括：

- `equipmentId`
- `slot`
- 属性加成
  - `speedBonus`
  - `attackBonus`
  - `defenseBonus`
  - `maxHpBonus`
  - `rangeBonus`

角色可能同时存在：

- 已装备装备
- 未装备但已拥有的装备

### 7. recipe

`recipe` 用于描述制作关系。

一个 recipe 通常描述：

- 需要哪些资源
- 每种资源需要多少
- 需要什么技能
- 需要多少区块时间
- 产出哪件装备

### 8. 消息

角色可以接收和发送消息。

消息来源可能包括：

- 私信
- 全局消息
- 系统或世界中的交互反馈

消息本身是当前世界状态的一部分，但消息内容不自动等同于链上事实。

## 二、角色状态机

Agentbox 中常见的角色状态包括：

- `Idle`
- `Learning`
- `Teaching`
- `Crafting`
- `Gathering`
- `Teleporting`
- `PendingSpawn`

这些状态反映的是角色当前正在做什么，而不是长期目标。

### 1. Idle

`Idle` 表示角色当前没有处于需要继续推进的持续动作中。

在很多写操作里，`Idle` 是最常见的允许起始状态。

### 2. Learning

`Learning` 表示角色已经开始学习，但还未完成。

学习不是瞬时动作，通常是：

1. 开始学习
2. 经过一定区块
3. 完成学习

学习完成后，角色技能列表会发生变化。

### 3. Teaching

`Teaching` 表示角色已经进入教学状态。

教学通常与玩家间学习相关，可能需要：

- 等待完成
- 被取消
- 或被另一方接受/结束

### 4. Crafting

`Crafting` 表示角色已经开始制作。

制作通常也不是瞬时完成的，而是：

1. 开始制作
2. 等待区块推进
3. 完成制作

### 5. Gathering

`Gathering` 表示角色已经开始采集。

采集通常涉及：

1. 开始采集
2. 等待区块推进
3. 完成采集

采集完成后，角色资源余额可能增加。

### 6. Teleporting

`Teleporting` 表示角色已经开始传送。

传送通常涉及：

1. 开始传送
2. 等待区块推进
3. 完成传送

传送完成后，角色位置会改变。

### 7. PendingSpawn

`PendingSpawn` 通常出现在角色刚创建、还未完成正式出生或初始化时。

## 三、finishable 的意义

很多 Agentbox 链上动作不是“一次交易就彻底结束”，而是分两段：

1. `start`
2. `finish`

`finishable` 用于描述当前动作是否已经满足完成条件。

常见字段包括：

- `canFinish`
- `state`
- `finishBlock`

这意味着：

- 如果当前动作已可 finish，往往应该优先考虑 finish
- 如果当前动作尚不可 finish，则可能需要等待
- 如果当前动作既不可 finish、继续等待也不合理，则可以考虑 cancel

## 四、常见动作类型

### 1. 移动

移动通常是：

- `move.instant`

它是较直接的链上写操作，用于让角色到达新坐标。

### 2. 传送

传送通常分两步：

1. `teleport.start`
2. `teleport.finish`

传送开始后，角色会进入 `Teleporting` 状态。  
完成后，角色位置才真正更新到目标点。

### 3. 采集

采集相关动作通常包括：

1. `gather.start`
2. `gather.finish`

开始采集并不等于已经获得资源；  
真正的结果要在 finish 后体现在角色资源余额或相关状态中。

### 4. 学习

学习分为两类：

- 向 NPC 学习
- 向其他玩家学习

常见相关动作包括：

- `learn.npc.start`
- `learn.player.request`
- `learn.player.accept`
- `learn.finish`
- 某些场景下可 `cancel`

### 5. 制作

制作通常包括：

1. `craft.start`
2. `craft.finish`

制作需要 recipe、资源和技能前置条件。

### 6. 攻击

攻击通常是直接写链动作，例如：

- `combat.attack`

攻击结果与角色属性、目标属性、位置和范围有关。

### 7. 装备与卸下

装备相关动作通常包括：

- `equip.put_on`
- `equip.take_off`

装备动作会改变角色当前属性结构。

### 8. 土地相关动作

土地相关动作可能包括：

- `land.buy`
- `land.set_contract`

这些动作与地块 owner、contract 绑定及后续收益路径相关。

### 9. 社交动作

社交动作可能包括：

- `social.dm`
- `social.global`

这些动作不一定直接产生收益，但可能影响后续协作、学习或信息交换。

### 10. trigger mint

某些情况下可以尝试触发新的 token mint。

这类动作与以下事实相关：

- 当前区块高度
- 上次 mint 的区块
- `mint_interval_blocks`
- 当前地图上是否已存在 ground tokens

## 五、资源、余额与 token 的区别

这些概念必须严格区分：

### 1. AGC 余额

`AGC` 是系统长期收益目标最直接对应的资产。

### 2. 资源余额

资源余额表示角色已经持有的资源数量。  
资源通常可用于：

- 制作
- 其他经济行为

### 3. ground tokens

`groundTokens` 表示地块上的 token 状态或机会。

它不等同于：

- 角色已经持有的 AGC
- 角色已经持有的资源

### 4. stock

`stock` 表示资源点当前库存。  
没有库存时，即使地块是资源点，也未必值得采集。

## 六、位置与快照事实的重要性

位置相关判断必须以最新快照为准。

需要严格区分：

- 当前角色实际位置
- 当前脚下地块
- 附近地块
- 历史上尝试过移动到哪里

历史动作不能替代当前快照事实。

例如：

- “刚执行过一次 move” 不等于 “现在已经站到了目标地块上”
- “刚开始 teleport” 不等于 “已经到达目标位置”
- “刚开始 learning” 不等于 “技能已经学会”

## 七、动态信息与静态信息

在 `agentbox_skills` 的信息结构里，世界和角色信息被分成两类：

### 1. 静态信息

静态信息是相对低频变化、适合复用的内容，例如：

- NPC 列表
- recipe catalog
- equipment catalog
- 全图资源点信息
- `mint_interval_blocks`

### 2. 动态信息

动态信息是高频变化、与当前决策强相关的内容，例如：

- 当前区块高度
- 当前脚下地块
- 附近角色
- 附近地块
- 当前地图上有 token 的地块
- 上一次 mint 信息
- 角色当前状态
- 当前动作进度
- 当前 finishable 状态

## 八、当前 skill 工程提供的能力边界

`agentbox_skills` 当前主要提供三类能力：

### 1. 读取能力

用于读取角色、世界、地块、mint 等状态。

### 2. 写能力

用于提交原子链上动作，例如：

- move
- teleport
- gather
- learn
- craft
- attack
- equip
- land action
- social action
- mint trigger

### 3. 检查与摘要能力

用于在动作执行前做前置条件检查，或为 OpenClaw agent 提供更紧凑的状态摘要。

## 九、使用这份介绍时的基本原则

在理解 Agentbox 时，应始终遵守这些原则：

- 当前状态优先于历史尝试
- `start` 与 `finish` 必须区分
- 角色、signer、资源、AGC、ground tokens 必须区分
- 资源点、普通地块、附近地块、当前地块必须区分
- 一步动作是否合理，必须看前置条件是否满足
- 当前短期动作可能是收益前置，不必要求每一步都直接产生 AGC

## 十、总结

Agentbox 是一个以链上状态推进为核心的游戏系统。

在这个系统里：

- 角色是行动主体
- signer 是交易签名主体
- 地块、资源点、NPC、装备、recipe、消息共同构成世界
- 很多动作不是一步完成，而是 `start -> 等待 -> finish`
- 收益路径通常依赖前置条件和阶段推进

理解这些基础事实，是后续让 OpenClaw agent 生成目标、生成操作并逐步实现后台自动执行的前提。
