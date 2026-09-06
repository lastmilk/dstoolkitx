import { Config } from '@alicloud/openapi-core/dist/utils'
import DypnsapiModule from '@alicloud/dypnsapi20170525'
import {
  SendSmsVerifyCodeRequest,
  SendSmsVerifyCodeResponse,
  CheckSmsVerifyCodeRequest,
  CheckSmsVerifyCodeResponse,
  GetMobileRequest,
  GetMobileResponse,
} from '@alicloud/dypnsapi20170525/dist/models/model'
import { env } from '../config/env.js'

// 阿里云号码认证服务（dypnsapi）：
// - 短信认证：sendSmsVerifyCode（内置模板免签名审批）+ checkSmsVerifyCode（验证码由阿里云端托管校验）
// - 一键登录：getMobile（客户端 SDK getLoginToken 产生的 accessToken 换真实手机号）
//
// 注意：dypnsapi20170525 是 dara v2 生成的 CJS 包，在 tsx/ESM 互操作下默认导入
// 拿到的是命名空间对象，Client 类挂在其 default 属性；Config 需从
// @alicloud/openapi-core/dist/utils 取（dypnsapi v2 基于 openapi-core 而非 openapi-client）。
interface DypnsapiClient {
  sendSmsVerifyCode(req: SendSmsVerifyCodeRequest): Promise<SendSmsVerifyCodeResponse>
  checkSmsVerifyCode(req: CheckSmsVerifyCodeRequest): Promise<CheckSmsVerifyCodeResponse>
  getMobile(req: GetMobileRequest): Promise<GetMobileResponse>
}

const Dypnsapi = (DypnsapiModule as unknown as { default: new (config: Config) => DypnsapiClient }).default

let client: DypnsapiClient | null = null

function getClient(): DypnsapiClient {
  if (!env.aliyun.enabled) throw Object.assign(new Error('短信/号码认证服务未配置'), { status: 503 })
  if (!client) {
    const config = new Config({
      accessKeyId: env.aliyun.akId,
      accessKeySecret: env.aliyun.akSecret,
      endpoint: 'dypnsapi.aliyuncs.com',
    })
    client = new Dypnsapi(config)
  }
  return client
}

function isConfigMissing(e: unknown): boolean {
  return (e as { status?: number })?.status === 503
}

/** 发送短信验证码（短信认证服务） */
export async function sendSmsCode(phone: string, countryCode = '86'): Promise<void> {
  const req = new SendSmsVerifyCodeRequest({ phoneNumber: phone, countryCode })
  try {
    const res = await getClient().sendSmsVerifyCode(req)
    if (!res.body?.success) {
      throw new Error(res.body?.message || `短信发送失败(${res.body?.code || 'UNKNOWN'})`)
    }
  } catch (e: any) {
    if (isConfigMissing(e)) throw e
    throw new Error(`短信发送失败：${e?.message || '服务异常'}`)
  }
}

/** 校验短信验证码 */
export async function checkSmsCode(phone: string, code: string, countryCode = '86'): Promise<void> {
  const req = new CheckSmsVerifyCodeRequest({ phoneNumber: phone, countryCode, verifyCode: code })
  try {
    const res = await getClient().checkSmsVerifyCode(req)
    if (!res.body?.success) {
      throw new Error(res.body?.message || `验证码错误(${res.body?.code || 'UNKNOWN'})`)
    }
  } catch (e: any) {
    if (isConfigMissing(e)) throw e
    throw new Error(`验证码校验失败：${e?.message || '服务异常'}`)
  }
}

/** 一键登录：accessToken 换手机号 */
export async function getMobile(accessToken: string): Promise<string> {
  const req = new GetMobileRequest({ accessToken })
  try {
    const res = await getClient().getMobile(req)
    const mobile = res.body?.getMobileResultDTO?.mobile ?? res.body?.mobile
    if (!mobile) {
      throw new Error(res.body?.message || `获取手机号失败(${res.body?.code || 'UNKNOWN'})`)
    }
    return mobile
  } catch (e: any) {
    if (isConfigMissing(e)) throw e
    throw new Error(`一键登录失败：${e?.message || '服务异常'}`)
  }
}
