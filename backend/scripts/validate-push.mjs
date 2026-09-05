#!/usr/bin/env node
/**
 * pre-receive 推送校验器（自包含，不 import 后端 TS 代码）
 * stdin 逐行： <old-sha> <new-sha> <refname>
 *
 * 规则（DsToolKit 对话仓库 JSON 规范）：
 *  1. 仅允许 refs/heads/* 的普通分支更新；拒绝 tag、分支删除
 *  2. 新增 blob 路径白名单：container.json、conversations/<id>.json
 *  3. blob mode 仅允许 100644；单文件 ≤ 2MB；单次推送新增总量 ≤ 50MB
 *  4. container.json：{name:string, deepseekUserId:string}
 *     conversations/<id>.json：{deepseekConvId:string(=文件名), title:string,
 *       mapping:object | messages:array 至少其一}
 * 任一违规 → stderr 输出原因，exit 1（推送被拒）。
 */
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const MAX_FILE = 2 * 1024 * 1024
const MAX_TOTAL = 50 * 1024 * 1024
const GIT_DIR = process.env.GIT_DIR || '.'

function reject(msg) {
  console.error(`[DsToolKit] 推送被拒绝：${msg}`)
  process.exit(1)
}

function gitText(args) {
  return execFileSync('git', ['-C', GIT_DIR, ...args], { maxBuffer: 256 * 1024 * 1024 }).toString()
}

function isZero(sha) {
  return /^0+$/.test(sha)
}

/** 校验单个对话 JSON 是否符合 schema */
function validateConversation(json, filename) {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return '必须是 JSON 对象'
  const id = filename.replace(/^conversations\//, '').replace(/\.json$/, '')
  if (typeof json.deepseekConvId !== 'string' || !json.deepseekConvId) return '缺少 deepseekConvId 字符串字段'
  if (json.deepseekConvId !== id) return `deepseekConvId(${json.deepseekConvId}) 与文件名(${id})不一致`
  if (typeof json.title !== 'string') return '缺少 title 字符串字段'
  const hasMapping = json.mapping !== undefined
  const hasMessages = json.messages !== undefined
  if (!hasMapping && !hasMessages) return '必须包含 mapping(object) 或 messages(array) 之一'
  if (hasMapping && (typeof json.mapping !== 'object' || json.mapping === null || Array.isArray(json.mapping))) {
    return 'mapping 必须是对象'
  }
  if (hasMessages && !Array.isArray(json.messages)) return 'messages 必须是数组'
  return null
}

/** 校验容器元信息 JSON */
function validateContainer(json) {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return '必须是 JSON 对象'
  if (typeof json.name !== 'string' || !json.name) return '缺少 name 字符串字段'
  if (typeof json.deepseekUserId !== 'string' || !json.deepseekUserId) return '缺少 deepseekUserId 字符串字段'
  return null
}

const rl = createInterface({ input: process.stdin })

for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed) continue
  const [oldRev, newRev, ref] = trimmed.split(/\s+/)
  if (!ref.startsWith('refs/heads/')) {
    reject(`仅允许更新普通分支 refs/heads/*，收到 ${ref}（tag 等不受支持）`)
  }
  if (isZero(newRev)) {
    reject(`不允许删除分支 ${ref}`)
  }
  if (isZero(oldRev)) continue // 新分支，下面统一按 new.. 枚举

  // 枚举 old..new 中真正新增的对象（含 blob mode/size），逐个校验
  let out
  try {
    out = gitText(['rev-list', '--objects', `${oldRev}..${newRev}`])
  } catch {
    continue // 非后代关系（force push 覆盖历史），无新增对象可枚举
  }
  const objectIds = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(/\s+/)[0])
  if (objectIds.length === 0) continue

  // cat-file --batch-check 批量获取 type/size；mode 需逐条 ls-tree
  const batchInput = objectIds.join('\n') + '\n'
  const batchOut = execFileSync('git', ['-C', GIT_DIR, 'cat-file', '--batch-check'], {
    input: batchInput,
    maxBuffer: 256 * 1024 * 1024,
  }).toString()
  const blobIds = []
  let totalSize = 0
  for (const row of batchOut.split('\n')) {
    if (!row.trim()) continue
    const [oid, type, sizeStr] = row.split(/\s+/)
    if (type !== 'blob') continue // commit/tree 对象由 git 自身管理
    const size = Number(sizeStr)
    if (size > MAX_FILE) reject(`文件超过单文件上限 ${MAX_FILE / 1024 / 1024}MB（blob ${oid.slice(0, 8)}，${size} 字节）`)
    totalSize += size
    blobIds.push(oid)
  }
  if (totalSize > MAX_TOTAL) {
    reject(`单次推送新增内容总量 ${totalSize} 字节超过上限 ${MAX_TOTAL}（50MB）`)
  }
  if (blobIds.length === 0) continue

  // 拿到每个新 blob 的路径与 mode：ls-tree 全量枚举新旧差异树
  const treeOut = gitText(['ls-tree', '-r', newRev])
  /** @type {Map<string, {path: string, mode: string}>} */
  const blobMap = new Map()
  for (const row of treeOut.split('\n')) {
    if (!row.trim()) continue
    const m = /^(\d+)\s+\w+\s+([0-9a-f]{40})\t(.+)$/.exec(row)
    if (!m) continue
    blobMap.set(m[2], { mode: m[1], path: m[3] })
  }

  for (const oid of blobIds) {
    const info = blobMap.get(oid)
    // blob 不出现在 new 树中 → 属于被覆盖/中间对象，跳过（最终树里不存在即无影响）
    if (!info) continue
    const { path: p, mode } = info
    if (mode !== '100644') reject(`文件 ${p} 的 mode 为 ${mode}，仅允许普通文件（100644）`)

    let err = null
    if (p === 'container.json') {
      try {
        err = validateContainer(JSON.parse(gitText(['cat-file', 'blob', oid])))
      } catch (e) {
        err = `JSON 解析失败：${e.message}`
      }
    } else if (/^conversations\/[^/]+\.json$/.test(p)) {
      let json
      try {
        json = JSON.parse(gitText(['cat-file', 'blob', oid]))
      } catch (e) {
        reject(`文件 ${p} 不是合法 JSON：${e.message}`)
      }
      err = validateConversation(json, p)
    } else {
      err = `路径 ${p} 不在白名单内（仅允许 container.json 与 conversations/<id>.json）`
    }
    if (err) reject(`文件 ${p} 校验失败：${err}`)
  }
}

process.exit(0)
