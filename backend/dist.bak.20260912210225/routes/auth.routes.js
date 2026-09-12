import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt, verifyAnyToken } from '../middleware/auth.js';
import { requireCaptcha } from '../middleware/captcha.js';
import { hashPassword, comparePassword } from '../utils/crypto.js';
import { signToken } from '../utils/token.js';
import { sendSmsCode, checkSmsCode, getMobile } from '../services/aliyunDypns.js';
import { hit } from '../utils/ratelimit.js';
import { needsPhoneForCloud, phoneRequiredResponse } from '../utils/cloudgate.js';
const router = Router();
const registerSchema = z.object({
    username: z.string().min(2).max(32),
    password: z.string().min(6).max(128),
});
// 注册：首个用户自动为 ADMIN，便于初始化后台。
// 新传统注册用户 registrationType=USERNAME_PASSWORD：须绑手机号才能用云端模式。
router.post('/register', requireCaptcha, asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '用户名至少 2 位，密码至少 6 位' });
    const { username, password } = parsed.data;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists)
        return res.status(409).json({ error: '用户名已存在' });
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'ADMIN' : 'USER';
    const created = await prisma.user.create({
        data: {
            username,
            passwordHash: await hashPassword(password),
            role,
            registrationType: 'USERNAME_PASSWORD',
        },
    });
    const token = signToken({ sub: created.id, username: created.username, role: created.role });
    return res.json({
        token,
        user: {
            id: created.id,
            username: created.username,
            role: created.role,
            cloudSyncEnabled: created.cloudSyncEnabled,
            phone: null,
            registrationType: created.registrationType,
        },
    });
}));
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});
router.post('/login', requireCaptcha, asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user)
        return res.status(401).json({ error: '用户名或密码错误' });
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ error: '用户名或密码错误' });
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    return res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            cloudSyncEnabled: user.cloudSyncEnabled,
            phone: maskPhone(user.phone),
            registrationType: user.registrationType,
        },
    });
}));
// ── 手机号辅助 ─────────────────────────────────────────────
const phoneSchema = z.object({ phone: z.string().regex(/^\d{5,20}$/), countryCode: z.string().regex(/^\d{1,4}$/).optional() });
function maskPhone(phone) {
    if (!phone)
        return null;
    if (phone.length < 8)
        return '****';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}
/** 一键登录换到的手机号可能带国家码前缀（如 8613800138000），归一化掉 */
function normalizeMobile(mobile) {
    return /^86\d{11}$/.test(mobile) ? mobile.slice(2) : mobile;
}
/** 阿里云服务异常 → 503 透传；业务失败 → 400 */
function smsErrorStatus(e) {
    return e?.status === 503 ? 503 : 400;
}
function authPayload(user) {
    return {
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            cloudSyncEnabled: user.cloudSyncEnabled,
            phone: maskPhone(user.phone),
            registrationType: user.registrationType,
        },
    };
}
/** 按手机号 find-or-create（验证码登录 / 一键登录共用）：新用户免密码、视为已验证 */
async function findOrCreatePhoneUser(phone) {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing)
        return existing;
    let username = '';
    for (let i = 0; i < 10; i++) {
        const candidate = 'u' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
        const taken = await prisma.user.findUnique({ where: { username: candidate } });
        if (!taken) {
            username = candidate;
            break;
        }
    }
    if (!username)
        throw Object.assign(new Error('用户名生成失败，请重试'), { status: 500 });
    return prisma.user.create({
        data: {
            username,
            passwordHash: await hashPassword(randomUUID()), // 随机密码：不可通过密码登录
            role: 'USER',
            phone,
            phoneVerifiedAt: new Date(),
            registrationType: 'PHONE',
        },
    });
}
// ── 短信验证码登录（新手机号自动注册） ──────────────────────
// 发送登录验证码：极验 → 频控（同手机 60s 间隔 / 10 条每天；同 IP 30 次每小时）
router.post('/sms/send', requireCaptcha, asyncHandler(async (req, res) => {
    const parsed = phoneSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '手机号格式错误' });
    const { phone, countryCode = '86' } = parsed.data;
    if (!hit(`sms:${phone}`, 60_000, 1))
        return res.status(429).json({ error: '发送太频繁，请 1 分钟后再试' });
    if (!hit(`smsday:${phone}`, 86_400_000, 10))
        return res.status(429).json({ error: '今日验证码发送次数已达上限' });
    if (!hit(`smsip:${req.ip || 'unknown'}`, 3_600_000, 30))
        return res.status(429).json({ error: '当前网络发送次数过多，请稍后再试' });
    try {
        await sendSmsCode(phone, countryCode);
    }
    catch (e) {
        return res.status(smsErrorStatus(e)).json({ error: e.message });
    }
    return res.json({ ok: true });
}));
router.post('/sms/login', asyncHandler(async (req, res) => {
    const parsed = z.object({
        phone: z.string().regex(/^\d{5,20}$/),
        code: z.string().min(4).max(8),
        countryCode: z.string().regex(/^\d{1,4}$/).optional(),
    }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '手机号或验证码格式错误' });
    const { phone, code, countryCode = '86' } = parsed.data;
    try {
        await checkSmsCode(phone, code, countryCode);
    }
    catch (e) {
        return res.status(smsErrorStatus(e)).json({ error: e.message });
    }
    const user = await findOrCreatePhoneUser(phone);
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    return res.json({ token, ...authPayload(user) });
}));
// ── 阿里云号码认证一键登录（仅移动端） ──────────────────────
router.post('/number-auth/login', asyncHandler(async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    let mobile;
    try {
        mobile = normalizeMobile(await getMobile(parsed.data.token));
    }
    catch (e) {
        return res.status(smsErrorStatus(e)).json({ error: e.message });
    }
    const user = await findOrCreatePhoneUser(mobile);
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    return res.json({ token, ...authPayload(user) });
}));
// ── 已登录用户绑定手机号 ────────────────────────────────────
router.post('/phone/send-code', verifyJwt, requireCaptcha, asyncHandler(async (req, res) => {
    const parsed = phoneSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '手机号格式错误' });
    const { phone, countryCode = '86' } = parsed.data;
    if (!hit(`bind:${phone}`, 60_000, 1))
        return res.status(429).json({ error: '发送太频繁，请 1 分钟后再试' });
    if (!hit(`bindday:${phone}`, 86_400_000, 5))
        return res.status(429).json({ error: '今日验证码发送次数已达上限' });
    try {
        await sendSmsCode(phone, countryCode, '100004');
    }
    catch (e) {
        return res.status(smsErrorStatus(e)).json({ error: e.message });
    }
    return res.json({ ok: true });
}));
router.post('/phone/bind', verifyAnyToken, asyncHandler(async (req, res) => {
    const parsed = z.object({
        phone: z.string().regex(/^\d{5,20}$/),
        code: z.string().min(4).max(8),
        countryCode: z.string().regex(/^\d{1,4}$/).optional(),
    }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '手机号或验证码格式错误' });
    const { phone, code, countryCode = '86' } = parsed.data;
    try {
        await checkSmsCode(phone, code, countryCode);
    }
    catch (e) {
        return res.status(smsErrorStatus(e)).json({ error: e.message });
    }
    const occupied = await prisma.user.findUnique({ where: { phone } });
    if (occupied && occupied.id !== req.user.id) {
        return res.status(409).json({ error: '该手机号已绑定其他账号' });
    }
    await prisma.user.update({
        where: { id: req.user.id },
        data: { phone, phoneVerifiedAt: new Date() },
    });
    return res.json({ ok: true });
}));
// ── 个人信息 / 云端开关 ─────────────────────────────────────
router.get('/me', verifyJwt, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: {
            id: true,
            username: true,
            role: true,
            cloudSyncEnabled: true,
            createdAt: true,
            tier: true,
            tierExpiresAt: true,
            isPermanentTier: true,
            aiCredits: true,
            referralCode: true,
            phone: true,
            phoneVerifiedAt: true,
            registrationType: true,
        },
    });
    return res.json({
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            cloudSyncEnabled: user.cloudSyncEnabled,
            createdAt: user.createdAt,
            tier: user.tier,
            tierExpiresAt: user.tierExpiresAt,
            isPermanentTier: user.isPermanentTier,
            aiCredits: user.aiCredits,
            referralCode: user.referralCode,
            phone: maskPhone(user.phone),
            phoneVerifiedAt: user.phoneVerifiedAt,
            registrationType: user.registrationType,
        },
    });
}));
const profileSchema = z.object({ username: z.string().min(2).max(32) });
router.put('/profile', verifyJwt, asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '用户名至少 2 位' });
    const username = parsed.data.username;
    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken && taken.id !== req.user.id)
        return res.status(409).json({ error: '用户名已被占用' });
    await prisma.user.update({ where: { id: req.user.id }, data: { username } });
    return res.json({ ok: true });
}));
const passwordSchema = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
});
router.put('/password', verifyJwt, asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const { oldPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    const ok = await comparePassword(oldPassword, user.passwordHash);
    if (!ok)
        return res.status(401).json({ error: '原密码错误' });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    return res.json({ ok: true });
}));
const cloudSchema = z.object({ enabled: z.boolean() });
router.put('/cloud-sync', verifyJwt, asyncHandler(async (req, res) => {
    const parsed = cloudSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    if (parsed.data.enabled) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: req.user.id },
            select: { registrationType: true, phone: true },
        });
        if (needsPhoneForCloud(user))
            return phoneRequiredResponse(res);
    }
    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { cloudSyncEnabled: parsed.data.enabled },
    });
    return res.json({ cloudSyncEnabled: updated.cloudSyncEnabled });
}));
export default router;
//# sourceMappingURL=auth.routes.js.map