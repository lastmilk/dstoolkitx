/**
 * 由扁平 messages（已带 turnIndex/versionIndex/subTurnIndex）聚合为 Turn[] 五层树。
 * 规则与 deepseekParser.buildNodeIndexMap 对应：
 *   - USER + turnIndex only                 → Turn.userNodeId
 *   - ASSISTANT + turnIndex+versionIndex    → Version.assistantNodeId
 *   - USER + turnIndex+versionIndex+subTurnIndex → SubTurn.userNodeId
 *   - ASSISTANT + turnIndex+versionIndex+subTurnIndex → SubTurn.assistantNodeId
 */
export function aggregateTurnsFromMessages(messages) {
    const turnMap = new Map();
    for (const m of messages) {
        if (m.turnIndex === null)
            continue;
        let turn = turnMap.get(m.turnIndex);
        if (!turn) {
            turn = { userNodeId: '', versions: new Map() };
            turnMap.set(m.turnIndex, turn);
        }
        if (m.versionIndex === null) {
            // Turn 用户提问节点
            if (m.role === 'USER')
                turn.userNodeId = m.nodeId;
            continue;
        }
        let ver = turn.versions.get(m.versionIndex);
        if (!ver) {
            ver = { assistantNodeId: '', subTurns: new Map() };
            turn.versions.set(m.versionIndex, ver);
        }
        if (m.subTurnIndex === null) {
            // Version 的 ASSISTANT 回复节点
            if (m.role === 'ASSISTANT')
                ver.assistantNodeId = m.nodeId;
            continue;
        }
        let sub = ver.subTurns.get(m.subTurnIndex);
        if (!sub) {
            sub = { userNodeId: '', assistantNodeId: null };
            ver.subTurns.set(m.subTurnIndex, sub);
        }
        if (m.role === 'USER')
            sub.userNodeId = m.nodeId;
        else if (m.role === 'ASSISTANT')
            sub.assistantNodeId = m.nodeId;
    }
    const turns = [];
    for (const [turnIndex, turn] of [...turnMap.entries()].sort((a, b) => a[0] - b[0])) {
        const versions = [];
        for (const [versionIndex, ver] of [...turn.versions.entries()].sort((a, b) => a[0] - b[0])) {
            const subTurns = [];
            for (const [subTurnIndex, sub] of [...ver.subTurns.entries()].sort((a, b) => a[0] - b[0])) {
                subTurns.push({
                    subTurnIndex,
                    userNodeId: sub.userNodeId,
                    assistantNodeId: sub.assistantNodeId,
                });
            }
            versions.push({
                versionIndex,
                assistantNodeId: ver.assistantNodeId,
                subTurns,
            });
        }
        turns.push({
            turnIndex,
            userNodeId: turn.userNodeId,
            versions,
        });
    }
    return turns;
}
//# sourceMappingURL=turns.js.map