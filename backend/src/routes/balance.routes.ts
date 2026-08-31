import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { decryptApiKey } from '../utils/crypto.js'
import { getDeepseekBalance } from '../services/deepseekApi.js'

const router = Router()
router.use(verifyJwt)

// GET /api/balance/:keyId
router.get('/:keyId', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.keyId)
  const k = await prisma.apiKey.findFirst({ where: { id, userId: req.user!.id } })
  if (!k) return res.status(404).json({ error: 'API Key 不存在' })
  const plain = decryptApiKey(k.keyCipher)
  const balance = await getDeepseekBalance(plain)
  return res.json({ balance })
}))

export default router
