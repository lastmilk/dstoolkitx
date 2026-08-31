import AdmZip from 'adm-zip'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { streamArray } from 'stream-json/streamers/stream-array.js'

export type ParsedRole = 'USER' | 'ASSISTANT'

export interface ParsedMessage {
  nodeId: string
  parentId: string | null
  role: ParsedRole
  model: string | null
  content: string
  insertedAt: Date
  turnIndex?: number
  versionIndex?: number
  subTurnIndex?: number
}

export interface SubTurn {
  subTurnIndex: number
  userNodeId: string
  assistantNodeId: string | null
}

export interface Version {
  versionIndex: number
  assistantNodeId: string
  subTurns: SubTurn[]
}

export interface Turn {
  turnIndex: number
  userNodeId: string
  versions: Version[]
}

export interface ParsedConversation {
  deepseekConvId: string
  title: string
  insertedAt: Date
  updatedAt: Date
  mapping: Record<string, unknown>
  messages: ParsedMessage[]
  turns: Turn[]
}

export interface ParsedDeepseekData {
  deepseekUser: {
    userId: string
    email: string | null
    mobile: string | null
  }
  conversations: ParsedConversation[]
}

function findEntryName(zip: AdmZip, filename: string): string | null {
  const entries = zip.getEntries()
  const hit = entries.find((e) => e.entryName.toLowerCase().endsWith(filename))
  return hit ? hit.entryName : null
}

function toRole(type: string): ParsedRole {
  // REQUEST = 用户输入，RESPONSE = AI 回答
  return type === 'RESPONSE' ? 'ASSISTANT' : 'USER'
}

/**
 * 取节点的首个 fragment 类型（'REQUEST' / 'RESPONSE' / 'FILE' / 其它）。
 * Deepseek 节点通常只有一个 fragment，但理论上可多个；这里以首个为准判定 USER/ASSISTANT。
 */
function getNodeFragType(mapping: Record<string, any>, nodeId: string): string | null {
  const node = mapping[nodeId]
  if (!node || !node.message) return null
  const frags: any[] = node.message.fragments || []
  return frags.length > 0 ? frags[0].type : null
}

/**
 * 提取五层树结构的 Turns：Date > Conversation > Turn > Version > SubTurn 中的 L3-L5。
 *
 * 算法：
 * 1. 主链（main chain）= 从 root 出发，每个节点取「最后一个子节点」继续，构成一条主路径。
 *    （Deepseek 导出中 children 顺序通常按生成时间，最后一个即用户最近一次采纳的分支）
 * 2. 主链上的 USER 节点（fragment.type === 'REQUEST'）依次为 Turn 0、1、2...
 * 3. 每个 Turn 的 USER 节点的所有 ASSISTANT 子节点（RESPONSE）为 Versions（上限 6）。
 * 4. 每个 Version 的 ASSISTANT 节点的 USER 子节点中，**不在主链上**的为 SubTurns（上限 6），
 *    其中 SubTurn.assistantNodeId 取该 USER 节点的首个 ASSISTANT 子节点（AI 对追问的回复）。
 *    （主链上的 USER 子节点作为下一 Turn，不计入 SubTurn）
 */
function extractTurns(mapping: Record<string, any>): Turn[] {
  const rootNode = Object.values<any>(mapping).find((n) => n && n.parent === null)
  if (!rootNode) return []

  const getChildren = (id: string): string[] => {
    const node = mapping[id]
    return node && Array.isArray(node.children) ? node.children.map((c: any) => String(c)) : []
  }
  const isUser = (id: string): boolean => getNodeFragType(mapping, id) === 'REQUEST'
  const isAssistant = (id: string): boolean => getNodeFragType(mapping, id) === 'RESPONSE'

  // 1. 计算主链（最后一个子节点为延续）+ 主链顺序
  const mainChain = new Set<string>()
  const mainChainOrder: string[] = []
  const visited = new Set<string>()
  let current: string | undefined = String(rootNode.id)
  while (current && !visited.has(current)) {
    visited.add(current)
    mainChain.add(current)
    mainChainOrder.push(current)
    const children = getChildren(current)
    if (children.length === 0) break
    current = children[children.length - 1]
  }

  // 2. 遍历主链，USER 节点 = Turn
  const turns: Turn[] = []
  for (const nodeId of mainChainOrder) {
    if (!isUser(nodeId)) continue
    const turn: Turn = {
      turnIndex: turns.length,
      userNodeId: nodeId,
      versions: [],
    }
    // 3. USER 的 ASSISTANT 子节点 = Versions
    for (const childId of getChildren(nodeId)) {
      if (!isAssistant(childId)) continue
      const version: Version = {
        versionIndex: turn.versions.length,
        assistantNodeId: childId,
        subTurns: [],
      }
      // 4. Version 的 USER 子节点中，不在主链上的 = SubTurns
      for (const subChildId of getChildren(childId)) {
        if (!isUser(subChildId)) continue
        if (mainChain.has(subChildId)) continue // 主链上的 USER = 下一 Turn，跳过
        // SubTurn 的 ASSISTANT 回复 = 该 USER 节点的首个 ASSISTANT 子节点
        let subAssistantId: string | null = null
        for (const grandChildId of getChildren(subChildId)) {
          if (isAssistant(grandChildId)) {
            subAssistantId = grandChildId
            break
          }
        }
        version.subTurns.push({
          subTurnIndex: version.subTurns.length,
          userNodeId: subChildId,
          assistantNodeId: subAssistantId,
        })
        if (version.subTurns.length >= 6) break
      }
      turn.versions.push(version)
      if (turn.versions.length >= 6) break
    }
    turns.push(turn)
  }

  return turns
}

/**
 * 由 turns 构建 nodeId -> {turnIndex, versionIndex?, subTurnIndex?} 映射，用于回填到扁平 messages[]。
 * 规则：
 *   - Turn.userNodeId            → {turnIndex}
 *   - Version.assistantNodeId    → {turnIndex, versionIndex}
 *   - SubTurn.userNodeId         → {turnIndex, versionIndex, subTurnIndex}
 *   - SubTurn.assistantNodeId    → {turnIndex, versionIndex, subTurnIndex}（与 SubTurn 同位）
 */
function buildNodeIndexMap(turns: Turn[]): Map<string, { turnIndex: number; versionIndex?: number; subTurnIndex?: number }> {
  const map = new Map<string, { turnIndex: number; versionIndex?: number; subTurnIndex?: number }>()
  for (const turn of turns) {
    map.set(turn.userNodeId, { turnIndex: turn.turnIndex })
    for (const version of turn.versions) {
      map.set(version.assistantNodeId, { turnIndex: turn.turnIndex, versionIndex: version.versionIndex })
      for (const subTurn of version.subTurns) {
        const idx = { turnIndex: turn.turnIndex, versionIndex: version.versionIndex, subTurnIndex: subTurn.subTurnIndex }
        map.set(subTurn.userNodeId, idx)
        if (subTurn.assistantNodeId) {
          map.set(subTurn.assistantNodeId, idx)
        }
      }
    }
  }
  return map
}

/**
 * 处理单个会话对象：extractTurns（依赖该会话的完整 mapping 树，无法流式）+
 * 前序遍历扁平化为 messages[]。流式解析时每解析完一个会话即调用此函数。
 */
function processConversation(c: any): ParsedConversation {
  const mapping: Record<string, any> = c.mapping || {}

  // 五层树（L3-L5）—— 需要完整 mapping，无法流式处理
  const turns = extractTurns(mapping)
  const indexMap = buildNodeIndexMap(turns)

  // 通过 parent/children 树的前序遍历得到正确顺序
  // （Deepseek 的 message.inserted_at 在生成场景下可能略早于用户提问，按时间排序会错位）
  const messages: ParsedMessage[] = []
  const rootNode = Object.values<any>(mapping).find((n) => n && n.parent === null)
  const visit = (nodeId: any) => {
    const node = mapping[nodeId]
    if (!node) return
    const msg = node.message
    if (msg) {
      const model: string | null = msg.model || null
      const ts: Date = msg.inserted_at ? new Date(msg.inserted_at) : new Date()
      const fragments: any[] = msg.fragments || []
      const canonicalId = String(node.id ?? nodeId ?? '')
      const idx = indexMap.get(canonicalId)
      for (const frag of fragments) {
        messages.push({
          nodeId: canonicalId,
          parentId: node.parent ? String(node.parent) : null,
          role: toRole(frag.type),
          model,
          content: typeof frag.content === 'string' ? frag.content : JSON.stringify(frag.content ?? ''),
          insertedAt: ts,
          turnIndex: idx?.turnIndex,
          versionIndex: idx?.versionIndex,
          subTurnIndex: idx?.subTurnIndex,
        })
      }
    }
    for (const childId of (node.children || [])) {
      visit(childId)
    }
  }
  if (rootNode) visit(rootNode.id)
  return {
    deepseekConvId: String(c.id),
    title: c.title || '(无标题)',
    insertedAt: c.inserted_at ? new Date(c.inserted_at) : new Date(),
    updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
    mapping,
    messages,
    turns,
  }
}

export interface DeepseekZipEntries {
  userJson: any
  /** conversations.json 的原始 Buffer，用于流式解析 */
  conversationsBuffer: Buffer
}

/** 从 zip 中提取 user.json + conversations.json 的 Buffer。 */
export function extractZipEntries(buffer: Buffer): DeepseekZipEntries {
  const zip = new AdmZip(buffer)
  const userEntryName = findEntryName(zip, 'user.json')
  const convEntryName = findEntryName(zip, 'conversations.json')
  if (!userEntryName || !convEntryName) {
    throw new Error('压缩包缺少 user.json 或 conversations.json，请确认是 Deepseek 导出的数据包')
  }
  const userJson = JSON.parse(zip.getEntry(userEntryName)!.getData().toString('utf8'))
  const conversationsBuffer = zip.getEntry(convEntryName)!.getData()
  return { userJson, conversationsBuffer }
}

export function buildDeepseekUser(userJson: any): ParsedDeepseekData['deepseekUser'] {
  const mobile = userJson.mobile
    ? `${userJson.mobile.area_code || ''} ${userJson.mobile.mobile_number || ''}`.trim()
    : null
  return {
    userId: String(userJson.user_id),
    email: userJson.email || null,
    mobile,
  }
}

/**
 * 流式解析 conversations.json 的原始 Buffer（顶层数组）：
 * 用 stream-json 增量解析，每解析完一个会话（mapping 已完整）即调用
 * onConversation 进行 extractTurns + 扁平化。仅解析阶段流式；
 * onConversation 内对单个会话的处理是同步的（extractTurns 依赖完整 mapping）。
 */
export async function streamConversationsBuffer(
  conversationsBuffer: Buffer,
  onConversation: (conv: ParsedConversation) => void | Promise<void>,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  const stream = streamArray.withParserAsStream()
  let loaded = 0
  try {
    await pipeline(
      Readable.from(conversationsBuffer),
      stream,
      async function (source: AsyncIterable<{ key: number; value: unknown }>) {
        for await (const item of source) {
          const parsed = processConversation(item.value)
          await onConversation(parsed)
          loaded++
          onProgress?.(loaded)
        }
      },
    )
  } catch (e) {
    // 回退：非数组结构等异常情况下用一次性 JSON.parse 兜底，保证不破坏现有上传
    const arr = JSON.parse(conversationsBuffer.toString('utf8')) as any[]
    for (const c of arr) {
      await onConversation(processConversation(c))
      loaded++
      onProgress?.(loaded)
    }
  }
}

/**
 * 流式解析 Deepseek 导出压缩包：用 stream-json 增量解析 conversations.json
 * 顶层数组，每解析完一个会话（mapping 已完整）即调用 onConversation 进行
 * extractTurns + 扁平化。这样大 JSON 解析阶段不会阻塞事件循环，且可分片
 * 写库 / 上报进度。extractTurns 仍依赖单个会话的完整 mapping 树（无法流式）。
 */
export async function parseDeepseekZipStream(
  buffer: Buffer,
  onConversation: (conv: ParsedConversation) => void | Promise<void>,
  onProgress?: (loaded: number) => void,
): Promise<ParsedDeepseekData['deepseekUser']> {
  const { userJson, conversationsBuffer } = extractZipEntries(buffer)
  const deepseekUser = buildDeepseekUser(userJson)
  await streamConversationsBuffer(conversationsBuffer, onConversation, onProgress)
  return deepseekUser
}

/**
 * 解析 Deepseek 导出压缩包：zip → user.json + conversations.json → 树→扁平消息 + 五层 turns
 * conversations.json 的 mapping 是 parent/children 树（类似 ChatGPT 导出），
 * 每个节点的 message.fragments[] 中 type 为 REQUEST/RESPONSE。
 *
 * 内部走流式解析（parseDeepseekZipStream），收集全部会话后返回。
 */
export async function parseDeepseekZip(buffer: Buffer): Promise<ParsedDeepseekData> {
  const conversations: ParsedConversation[] = []
  const deepseekUser = await parseDeepseekZipStream(buffer, (conv) => {
    conversations.push(conv)
  })
  return { deepseekUser, conversations }
}
