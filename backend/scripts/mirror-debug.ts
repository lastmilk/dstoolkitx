import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prisma } from '../src/utils/prisma.js'
import { upsertConversations, repoConversationToParsed } from '../src/services/conversationStore.js'

const execFileP = promisify(execFile)
async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, { maxBuffer: 256 * 1024 * 1024 })
  return stdout
}

const repoPath = 'data/git-repos/u13_c10.git'
const rootSha = (await git(['-C', repoPath, 'rev-list', '--max-parents=0', 'HEAD'])).trim()
const headSha = (await git(['-C', repoPath, 'rev-parse', 'HEAD'])).trim()
console.log('range', rootSha, '->', headSha)

const out = await git(['-C', repoPath, 'diff', '--name-status', rootSha, headSha])
console.log('diff out:', JSON.stringify(out))

const content = await git(['-C', repoPath, 'show', `${headSha}:conversations/conv-002.json`])
console.log('content len:', content.length)
const json = JSON.parse(content)
console.log('json keys:', Object.keys(json))
const parsed = repoConversationToParsed(json)
console.log('parsed:', parsed ? { id: parsed.deepseekConvId, title: parsed.title, msgs: parsed.messages.length, turns: parsed.turns.length } : 'NULL')
if (parsed) {
  await upsertConversations(13, 10, [parsed])
  console.log('upsert done')
  const rows = await prisma.conversation.findMany({ where: { configId: 10 }, select: { deepseekConvId: true, title: true } })
  console.log('DB rows:', JSON.stringify(rows))
}
await prisma.$disconnect()
