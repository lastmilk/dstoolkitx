import { prisma } from '../utils/prisma.js';
import { hashGitApiKey, GIT_KEY_PREFIX } from '../utils/gitapikey.js';
import { TOKEN_PREFIX, hashToken, isApiTokenFormat } from '../utils/apitoken.js';
import { verifyToken } from '../utils/token.js';
/**
 * 解析仓库标识 `u<uid>_c<cid>.git` → { userId, containerId }；不合法返回 null。
 */
export function parseRepoName(name) {
    const m = /^u(\d+)_c(\d+)\.git$/.exec(name);
    if (!m)
        return null;
    const userId = Number(m[1]);
    const containerId = Number(m[2]);
    if (!Number.isInteger(userId) || !Number.isInteger(containerId))
        return null;
    return { userId, containerId };
}
/**
 * 内置客户端通道（Web 端 / APP 端）：Basic 密码直接使用会话凭证
 * （dstk_ API 令牌 / JWT），身份从凭证解析，无需 GitUsername 与 dstkg_ APIKey。
 * 非 dstk_/JWT 形态的密码返回 null（交由 dstkg_ APIKey 通道处理）。
 */
async function authBySessionCredential(key) {
    try {
        if (key.startsWith(TOKEN_PREFIX)) {
            // dstk_ API 令牌（APP 端登录态，与 /v1/* verifyApiToken 同源）
            if (!isApiTokenFormat(key))
                return null;
            const found = await prisma.apiToken.findUnique({
                where: { tokenHash: hashToken(key) },
                include: { user: { select: { id: true, username: true } } },
            });
            if (!found)
                return null;
            if (found.expiresAt && found.expiresAt < new Date())
                return null;
            prisma.apiToken
                .update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
                .catch(() => { });
            return { userId: found.user.id, username: found.user.username, gitKeyId: 0, containerId: null };
        }
        if (key.startsWith('eyJ')) {
            // JWT（Web 端登录态）
            const payload = verifyToken(key);
            const user = await prisma.user.findUnique({
                where: { id: payload.sub },
                select: { id: true, username: true },
            });
            if (!user)
                return null;
            return { userId: user.id, username: user.username, gitKeyId: 0, containerId: null };
        }
    }
    catch {
        return null;
    }
    return null;
}
/**
 * Git Basic Auth 校验（push/pull 统一）：
 *  - 内置客户端（Web/APP）：Basic 密码 = 会话凭证（dstk_ 令牌 / JWT），自动携带，免 GitUsername/APIKey；
 *  - 外部 Git 客户端：Basic 用户名 + dstkg_ APIKey（原有流程）。
 * 成功返回鉴权结果，失败返回 HTTP 状态码与提示。
 */
export async function gitBasicAuth(req, repo) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Basic ')) {
        return { ok: false, status: 401, message: '需要 Basic 认证（内置同步自动携带会话凭证；外部 Git 客户端使用 GitUsername + dstkg_ APIKey）' };
    }
    let decoded;
    try {
        decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    }
    catch {
        return { ok: false, status: 401, message: 'Basic 认证头格式错误' };
    }
    const idx = decoded.indexOf(':');
    if (idx < 0)
        return { ok: false, status: 401, message: 'Basic 认证头格式错误' };
    const username = decoded.slice(0, idx);
    const key = decoded.slice(idx + 1);
    // ── 内置客户端通道：会话凭证直连（身份以凭证为准，用户名段忽略） ──
    if (key.startsWith(TOKEN_PREFIX) || key.startsWith('eyJ')) {
        const auth = await authBySessionCredential(key);
        if (!auth) {
            return { ok: false, status: 401, message: '登录凭证无效或已过期，请重新登录后再同步' };
        }
        if (repo.userId !== auth.userId) {
            return { ok: false, status: 403, message: '无权访问该仓库' };
        }
        return { ok: true, auth };
    }
    // ── 外部 Git 客户端通道：GitUsername + dstkg_ APIKey ──
    if (!key.startsWith(GIT_KEY_PREFIX)) {
        return { ok: false, status: 401, message: 'APIKey 应以 dstkg_ 开头（在个人中心 Git 凭证处创建）' };
    }
    const found = await prisma.gitApiKey.findUnique({
        where: { keyHash: hashGitApiKey(key) },
        include: { user: { select: { id: true, username: true, gitUsername: true } } },
    });
    if (!found || found.revokedAt) {
        return { ok: false, status: 401, message: 'Git APIKey 无效或已撤销' };
    }
    if (found.expiresAt && found.expiresAt < new Date()) {
        return { ok: false, status: 401, message: 'Git APIKey 已过期' };
    }
    const user = found.user;
    // 用户名必须匹配：优先 gitUsername；未设置 gitUsername 的 ASCII 用户名可直接使用
    const effective = user.gitUsername ?? (/[^\x00-\x7F]/.test(user.username) ? null : user.username);
    if (!effective || effective !== username) {
        return { ok: false, status: 401, message: '用户名不匹配（应使用 Git 推送用户名）' };
    }
    // 仓库归属校验
    if (repo.userId !== user.id) {
        return { ok: false, status: 403, message: '无权访问该仓库' };
    }
    // key 作用域：全局 key 可访问全部容器；容器 key 仅限绑定容器
    if (found.containerId != null && found.containerId !== repo.containerId) {
        return { ok: false, status: 403, message: '该 APIKey 仅限指定对话容器使用' };
    }
    prisma.gitApiKey
        .update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
        .catch(() => { });
    return {
        ok: true,
        auth: { userId: user.id, username: user.username, gitKeyId: found.id, containerId: found.containerId },
    };
}
//# sourceMappingURL=gitAuth.js.map