const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const users = await p.user.findMany({
    where: { OR: [{ username: 'git测试用户' }, { username: 'other-user' }] },
    select: { id: true, username: true, gitUsername: true },
  })
  console.log('users:', JSON.stringify(users))
  const cfgs = await p.deepseekConfig.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { id: true, userId: true, name: true, deepseekUserId: true },
  })
  console.log('configs:', JSON.stringify(cfgs))
  const convs = await p.conversation.findMany({ select: { configId: true, deepseekConvId: true, title: true } })
  console.log('ALL conversations:', JSON.stringify(convs))
  await p.$disconnect()
})()
