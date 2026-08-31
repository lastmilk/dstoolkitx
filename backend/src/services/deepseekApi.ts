import { env } from '../config/env.js'

export interface DeepseekBalance {
  isAvailable: boolean
  balanceInfos: Array<{
    currency: string
    totalBalance: string
    grantedBalance: string
    toppedUpBalance: string
  }>
}

/**
 * 调用 Deepseek 余额接口（服务端代理，密钥不在前端暴露）
 */
export async function getDeepseekBalance(apiKey: string): Promise<DeepseekBalance> {
  const res = await fetch(`${env.deepseekApiBase}/user/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deepseek 接口错误 (${res.status}): ${text || res.statusText}`)
  }
  return (await res.json()) as DeepseekBalance
}
