import crypto from 'node:crypto';
/** 卡密格式：DSTK-XXXX-XXXX-XXXX（16 位有效字符，去掉易混淆 0/O/1/I/L） */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomBlock(len = 4) {
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}
/** 生成一张卡密：DSTK-XXXX-XXXX-XXXX */
export function generateCardCode() {
    return `DSTK-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
}
/** 生成多张卡密（去重） */
export function generateCardCodes(count) {
    const set = new Set();
    while (set.size < count) {
        set.add(generateCardCode());
    }
    return Array.from(set);
}
/** 生成批次 ID：batch + 时间戳 + 随机后缀 */
export function generateBatchId() {
    return `batch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}
//# sourceMappingURL=card.js.map