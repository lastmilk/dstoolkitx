/**
 * 一次性卡密导入脚本：从 /kami 目录读取 kufaka 卡密并批量入库
 * 运行：tsx scripts/import-kami.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient, type CardDuration, type Tier } from '@prisma/client'

const prisma = new PrismaClient()

// 文件名 → (tier, duration) 映射
const FILE_MAP: Record<string, { tier: Tier; duration: CardDuration }> = {
  'pro.txt': { tier: 'PRO', duration: 'PERMANENT' },
  'plus.txt': { tier: 'PLUS', duration: 'PERMANENT' },
  'plus_year.txt': { tier: 'PLUS', duration: 'ANNUAL' },
  'Ultimate.txt': { tier: 'ULTIMATE', duration: 'PERMANENT' },
  'Ultimate_year.txt': { tier: 'ULTIMATE', duration: 'ANNUAL' },
}

const KAMI_DIR = resolve(process.cwd(), '..', 'kami')

async function main() {
  const files = readdirSync(KAMI_DIR).filter((f) => f.endsWith('.txt'))
  console.log(`发现 ${files.length} 个卡密文件：${files.join(', ')}`)

  let totalImported = 0
  const BATCH = 1000

  for (const file of files) {
    const mapping = FILE_MAP[file]
    if (!mapping) {
      console.warn(`跳过未识别文件：${file}`)
      continue
    }

    const raw = readFileSync(join(KAMI_DIR, file), 'utf-8')
    const codes: string[] = Array.from(
      new Set<string>(
        raw
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0),
      ),
    )
    const batchId = `kami-import-${file.replace(/\.\w+$/, '')}-${Date.now()}`

    let inserted = 0
    for (let i = 0; i < codes.length; i += BATCH) {
      const slice = codes.slice(i, i + BATCH)
      const res = await prisma.redeemCard.createMany({
        data: slice.map((code: string) => ({
          code,
          tier: mapping.tier,
          duration: mapping.duration,
          source: 'KUFAKA' as const,
          status: 'UNUSED' as const,
          batchId,
        })),
        skipDuplicates: true,
      })
      inserted += res.count
    }

    totalImported += inserted
    console.log(`✓ ${file}: ${codes.length} 行 → 入库 ${inserted} 张 (${mapping.tier}/${mapping.duration}) [batch: ${batchId}]`)
  }

  console.log(`\n导入完成，共入库 ${totalImported} 张卡密`)
}

main()
  .catch((e) => {
    console.error('导入失败：', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
