import type { Response } from 'express'
import type { RegistrationType } from '@prisma/client'

/**
 * 云端模式手机号闸门：
 * 传统（用户名/密码）注册的新用户必须绑定手机号后才能使用云端模式；
 * 存量用户（LEGACY）与手机号注册用户（PHONE）不受影响。
 */
export function needsPhoneForCloud(user: { registrationType: RegistrationType; phone: string | null }): boolean {
  return user.registrationType === 'USERNAME_PASSWORD' && !user.phone
}

export function phoneRequiredResponse(res: Response): Response {
  return res.status(403).json({
    error: '请先绑定手机号后再使用云端模式',
    code: 'PHONE_REQUIRED_FOR_CLOUD',
  })
}
