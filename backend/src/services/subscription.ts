import { prisma } from '../utils/prisma.js'
import { TIER_RANK, TIER_LIMITS, getUserUsage, type UserUsage } from '../utils/quota.js'
import type { Tier, RedeemCard } from '@prisma/client'

/** 判定用户当前有效等级（考虑年费到期）。永久等级永不过期。 */
export function resolveEffectiveTier(user: {
  tier: Tier
  tierExpiresAt: Date | null
  isPermanentTier: boolean
}): Tier {
  if (user.isPermanentTier) return user.tier
  if (user.tier === 'FREE') return 'FREE'
  if (user.tierExpiresAt && user.tierExpiresAt < new Date()) {
    // 年费到期，降回 FREE
    return 'FREE'
  }
  return user.tier
}

export interface TierStatus {
  tier: Tier
  effectiveTier: Tier
  isPermanent: boolean
  activatedAt: Date | null
  expiresAt: Date | null
  expired: boolean
  usage: UserUsage
  limits: (typeof TIER_LIMITS)[Tier]
}

/** 获取用户会员状态概览（等级 + 用量 + 配额） */
export async function getTierStatus(userId: number): Promise<TierStatus> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      tier: true,
      tierActivatedAt: true,
      tierExpiresAt: true,
      isPermanentTier: true,
    },
  })
  const effectiveTier = resolveEffectiveTier(user)
  const usage = await getUserUsage(userId)
  return {
    tier: user.tier,
    effectiveTier,
    isPermanent: user.isPermanentTier,
    activatedAt: user.tierActivatedAt,
    expiresAt: user.tierExpiresAt,
    expired: effectiveTier === 'FREE' && user.tier !== 'FREE',
    usage,
    limits: TIER_LIMITS[effectiveTier],
  }
}

/**
 * 用卡密激活/升级会员等级。
 * - 仅当新等级严格高于当前有效等级时才覆盖（避免用 PRO 卡覆盖已有的 ULTIMATE）
 * - 同等级永久覆盖年费
 * - 年费：自激活起 365 天；若当前已有更高到期日，则在当前基础上 +365 天
 */
export async function activateTierWithCard(
  userId: number,
  card: RedeemCard,
): Promise<{ tier: Tier; expiresAt: Date | null; isPermanent: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true, tierExpiresAt: true, isPermanentTier: true },
  })
  const currentEffective = resolveEffectiveTier(user)

  // 新卡等级低于或等于当前：仅在同等级或更低时不覆盖永久/更高等级
  // 规则简化：新等级权重 >= 当前有效权重 才覆盖；永久卡直接置永久
  const shouldCover = TIER_RANK[card.tier] >= TIER_RANK[currentEffective]
  const now = new Date()

  let newTier: Tier
  let newExpiresAt: Date | null
  let newIsPermanent: boolean

  if (!shouldCover) {
    // 新卡等级更低，不覆盖主等级，但仍记录兑换（卡作废）
    newTier = user.tier
    newExpiresAt = user.tierExpiresAt
    newIsPermanent = user.isPermanentTier
  } else {
    newTier = card.tier
    if (card.duration === 'PERMANENT') {
      newIsPermanent = true
      newExpiresAt = null
    } else {
      // 年费：若当前未过期且有剩余，在剩余基础上 +365 天
      const base = user.tierExpiresAt && user.tierExpiresAt > now && user.tier === card.tier
        ? user.tierExpiresAt
        : now
      newIsPermanent = false
      newExpiresAt = new Date(base.getTime() + 365 * 24 * 3600 * 1000)
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        tier: newTier,
        tierActivatedAt: now,
        tierExpiresAt: newExpiresAt,
        isPermanentTier: newIsPermanent,
      },
    }),
    prisma.redeemCard.update({
      where: { id: card.id },
      data: {
        status: 'USED',
        usedById: userId,
        redeemedAt: now,
      },
    }),
  ])

  return { tier: newTier, expiresAt: newExpiresAt, isPermanent: newIsPermanent }
}
