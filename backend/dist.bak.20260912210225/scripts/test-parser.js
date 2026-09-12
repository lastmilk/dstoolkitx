import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDeepseekZip } from '../services/deepseekParser.js';
import { toAlpacaSingle, toAlpacaMulti } from '../services/alpacaConverter.js';
const zipPath = resolve(process.cwd(), 'assest/deepseek_data-2026-08-19(1).zip');
const buf = readFileSync(zipPath);
const data = await parseDeepseekZip(buf);
console.log('deepseekUser:', JSON.stringify(data.deepseekUser));
console.log('conversations:', data.conversations.length);
let totalMsgs = 0;
let userMsgs = 0;
let aiMsgs = 0;
for (const c of data.conversations) {
    totalMsgs += c.messages.length;
    for (const m of c.messages) {
        if (m.role === 'USER')
            userMsgs++;
        else
            aiMsgs++;
    }
}
console.log('totalMessages:', totalMsgs, 'user:', userMsgs, 'assistant:', aiMsgs);
console.log('first conversation title:', data.conversations[0]?.title);
console.log('first conv first msg role/content[0..40]:', data.conversations[0]?.messages[0]?.role, JSON.stringify((data.conversations[0]?.messages[0]?.content || '').slice(0, 40)));
console.log('first conv second msg role:', data.conversations[0]?.messages[1]?.role, 'model:', data.conversations[0]?.messages[1]?.model);
// 五层树 turns 结构（L3 Turn / L4 Version / L5 SubTurn）
const firstConv = data.conversations[0];
const firstConvTurns = firstConv?.turns ?? [];
console.log('first conv turns.length:', firstConvTurns.length);
console.log('first conv first turn versions.length:', firstConvTurns[0]?.versions.length);
console.log('first conv first turn first version subTurns.length:', firstConvTurns[0]?.versions[0]?.subTurns.length);
// 找一个 subTurns 最多的 version，验证 36 上限场景
let maxSubTurns = 0;
let maxSubTurnsDesc = '';
let totalSubTurns = 0;
for (const c of data.conversations) {
    for (const t of c.turns) {
        for (const v of t.versions) {
            totalSubTurns += v.subTurns.length;
            if (v.subTurns.length > maxSubTurns) {
                maxSubTurns = v.subTurns.length;
                maxSubTurnsDesc = `conv=${c.deepseekConvId.slice(0, 8)} turn=${t.turnIndex} version=${v.versionIndex}`;
            }
        }
    }
}
console.log('total subTurns across all convs:', totalSubTurns);
console.log('max subTurns on a single version:', maxSubTurns, '(' + maxSubTurnsDesc + ')');
// 抽样：打印第一会话第一 turn 的结构
if (firstConvTurns[0]) {
    const t0 = firstConvTurns[0];
    console.log('first turn sample:', JSON.stringify({
        turnIndex: t0.turnIndex,
        userNodeId: t0.userNodeId,
        versions: t0.versions.map((v) => ({
            versionIndex: v.versionIndex,
            assistantNodeId: v.assistantNodeId,
            subTurns: v.subTurns.map((s) => ({ subTurnIndex: s.subTurnIndex, userNodeId: s.userNodeId, assistantNodeId: s.assistantNodeId })),
        })),
    }));
}
// 抽样：打印 flat messages 中带 index 字段的前 3 条
const indexedMsgs = (firstConv?.messages ?? []).filter((m) => m.turnIndex !== undefined).slice(0, 3);
console.log('first conv indexed msgs sample:', JSON.stringify(indexedMsgs.map((m) => ({ role: m.role, nodeId: m.nodeId, turnIndex: m.turnIndex, versionIndex: m.versionIndex, subTurnIndex: m.subTurnIndex }))));
const single = toAlpacaSingle(data.conversations);
const multi = toAlpacaMulti(data.conversations);
console.log('alpaca single items:', single.length);
console.log('alpaca multi items:', multi.length);
console.log('first single instruction[0..40]:', JSON.stringify((single[0]?.instruction || '').slice(0, 40)));
console.log('first single output[0..40]:', JSON.stringify((single[0]?.output || '').slice(0, 40)));
console.log('OK');
//# sourceMappingURL=test-parser.js.map