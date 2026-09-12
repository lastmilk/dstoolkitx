import { Config } from '@alicloud/openapi-core/dist/utils.js';
import DypnsapiModule from '@alicloud/dypnsapi20170525';
import { SendSmsVerifyCodeRequest, CheckSmsVerifyCodeRequest, GetMobileRequest, } from '@alicloud/dypnsapi20170525/dist/models/model.js';
import { env } from '../config/env.js';
const Dypnsapi = DypnsapiModule.default;
let client = null;
function getClient() {
    if (!env.aliyun.enabled)
        throw Object.assign(new Error('短信/号码认证服务未配置'), { status: 503 });
    if (!client) {
        const config = new Config({
            accessKeyId: env.aliyun.akId,
            accessKeySecret: env.aliyun.akSecret,
            endpoint: 'dypnsapi.aliyuncs.com',
        });
        client = new Dypnsapi(config);
    }
    return client;
}
function isConfigMissing(e) {
    return e?.status === 503;
}
/**
 * 发送短信验证码（阿里云短信认证服务）
 * @param templateCode 内置模板 Code：100001 登录/注册、100002 修改绑定手机号、
 *                     100003 重置密码、100004 绑定新手机号、100005 验证绑定手机号
 */
export async function sendSmsCode(phone, countryCode = '86', templateCode = '100001') {
    const signName = env.aliyun.signName;
    if (!signName) {
        throw Object.assign(new Error('短信签名未配置：请在 .env 设置 ALIYUN_SMS_SIGN_NAME（阿里云短信控制台已审核通过的签名名称）'), { status: 503 });
    }
    const req = new SendSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode,
        signName,
        templateCode,
        // 内置模板均含 ${code} 与 ${min} 两个变量：code 用占位符由系统生成，
        // min 为验证码有效期分钟数（默认 ValidTime=300s=5 分钟，必须与之一致）
        templateParam: JSON.stringify({ code: '##code##', min: '5' }),
        // 传入 ##code## 占位符时 CodeType 必填：1=纯数字
        codeType: 1,
    });
    try {
        const res = await getClient().sendSmsVerifyCode(req);
        if (!res.body?.success) {
            throw new Error(res.body?.message || `短信发送失败(${res.body?.code || 'UNKNOWN'})`);
        }
    }
    catch (e) {
        if (isConfigMissing(e))
            throw e;
        throw new Error(`短信发送失败：${e?.message || '服务异常'}`);
    }
}
/** 校验短信验证码 */
export async function checkSmsCode(phone, code, countryCode = '86') {
    const req = new CheckSmsVerifyCodeRequest({ phoneNumber: phone, countryCode, verifyCode: code });
    try {
        const res = await getClient().checkSmsVerifyCode(req);
        if (!res.body?.success) {
            throw new Error(res.body?.message || `验证码错误(${res.body?.code || 'UNKNOWN'})`);
        }
    }
    catch (e) {
        if (isConfigMissing(e))
            throw e;
        throw new Error(`验证码校验失败：${e?.message || '服务异常'}`);
    }
}
/** 一键登录：accessToken 换手机号 */
export async function getMobile(accessToken) {
    const req = new GetMobileRequest({ accessToken });
    try {
        const res = await getClient().getMobile(req);
        const mobile = res.body?.getMobileResultDTO?.mobile ?? res.body?.mobile;
        if (!mobile) {
            throw new Error(res.body?.message || `获取手机号失败(${res.body?.code || 'UNKNOWN'})`);
        }
        return mobile;
    }
    catch (e) {
        if (isConfigMissing(e))
            throw e;
        throw new Error(`一键登录失败：${e?.message || '服务异常'}`);
    }
}
//# sourceMappingURL=aliyunDypns.js.map