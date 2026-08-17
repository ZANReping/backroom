// v58 联机协议：PeerJS 之上的消息类型（房主星型拓扑——客户端只连房主，房主聚合转发）
import type { AvatarCfg } from '../core/avatar'

/** 玩家 lobby 形象与名称 */
export interface MpIdentity { name: string; avatar: Partial<AvatarCfg> }

/** 玩家逐帧状态（12Hz） */
export interface MpPlayerState {
  x: number; y: number; z: number // 窗口内坐标 + 脚底高度
  yaw: number; pitch: number
  level: number
  moving: boolean; sprint: boolean; crouch: boolean; swim: boolean
  attack: boolean // 本帧触发攻击动作（远端播一次挥击）
  held: string | null // 手持物品 type（第三人称展示）
  dead: boolean
  iso: boolean // 本端正处于孤立效应区域（L0 非马尼拉室）——任一端孤立即互不可见
}

/** 实体快照（房主权威，世界坐标；~6Hz 广播） */
export interface MpEntSnap {
  nid: number // 房主分配的联机实体 id
  tp: string // def.type
  x: number; y: number; z: number
  f: number // facing
  st: string // AIState
  hp: number
  dead: boolean
  hid: boolean | null // hidden（埋伏中）
  dis: string | null // disguised（窃皮者伪装）
}

/** 世界事件（折中同步：先到先得共享物资/门/容器/出口/死亡 + 全局现象 + 联机战斗） */
export type MpEvent =
  | { t: 'takeItem'; id: number } // 地面物品被捡走（按物品 id 移除）
  | { t: 'dropItem'; id: number; it: string; x: number; y: number } // 房主击杀掉落物生成（世界坐标）
  | { t: 'loot'; sid: number } // 容器被搜空（按结构 sid 标记 looted）
  | { t: 'door'; x: number; y: number; open: boolean } // 门开合（按世界坐标匹配结构）
  | { t: 'exit'; dest: number } // 有玩家经出口换层（仅播报提示）
  | { t: 'died'; text: string } // 玩家死亡（播报）
  | { t: 'blackout'; ph: 'warn' | 'start' | 'end'; dur?: number } // L1「闪烁」停电链（房主权威）
  | { t: 'entHit'; nid: number; dmg: number } // 客人上报对联机实体的伤害（仅房主结算）

export interface MpLobbyPlayer extends MpIdentity { id: string; slot: number; ready: boolean }

export type MpMsg =
  | { k: 'hello'; idn: MpIdentity } // c→h：加入握手
  | { k: 'lobby'; players: MpLobbyPlayer[] } // h→c：大厅快照（含槽位分配）
  | { k: 'ready'; ready: boolean } // c→h：切换准备
  | { k: 'start'; seed: number } // h→c：开局（种子=会话种子；槽位取大厅快照）
  | { k: 'state'; id: string; s: MpPlayerState } // c→h：玩家状态；h 聚合后广播
  | { k: 'states'; all: Record<string, MpPlayerState> } // h→c：聚合状态（含房主自己）
  | { k: 'ents'; level: number; list: MpEntSnap[] } // h→c：房主权威实体快照（世界坐标）
  | { k: 'event'; id: string; e: MpEvent } // 双向：世界事件（c→h→广播；h 自身事件直接广播）
  | { k: 'leave'; id: string } // h→c：某玩家离开
  | { k: 'end' } // h→c：房主解散房间
  | { k: 'reject'; reason: string } // h→c：拒绝（满员/已开局）
