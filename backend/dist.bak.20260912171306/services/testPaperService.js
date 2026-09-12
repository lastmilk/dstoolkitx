import { prisma } from '../utils/prisma.js';
import { callDeepseek } from './aiClient.js';
/**
 * 从用户知识库中检索与需求相关的知识片段。
 * 范围：用户所有对话的消息内容（含 DeepSeek 导入 + 统一对话）。
 * 策略：关键词匹配 + 最近对话优先，截断到合理 token 长度。
 */
export async function retrieveUserKnowledge(userId, requirement, maxChars = 30000) {
    const keywords = requirement
        .split(/[\s,，。、；;]+/)
        .filter((k) => k.length >= 2)
        .slice(0, 10);
    const chunks = [];
    // 1. 从 DeepSeek 导入的对话中检索
    try {
        const deepseekConvs = await prisma.conversation.findMany({
            where: { config: { userId } },
            select: {
                id: true,
                title: true,
                messages: {
                    where: {
                        OR: keywords.length
                            ? keywords.map((k) => ({ content: { contains: k } }))
                            : undefined,
                    },
                    select: { content: true, role: true },
                    orderBy: { insertedAt: 'desc' },
                    take: 30,
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });
        for (const conv of deepseekConvs) {
            const text = conv.messages
                .map((m) => `【${m.role === 'USER' ? '用户' : 'AI'}】${m.content}`)
                .join('\n');
            if (text.trim()) {
                chunks.push({ conversationId: conv.id, conversationTitle: conv.title, text });
            }
        }
    }
    catch {
        // ignore
    }
    // 2. 从统一对话中检索
    try {
        const unifiedConvs = await prisma.unifiedConversation.findMany({
            where: { userId },
            select: {
                id: true,
                title: true,
                messages: {
                    where: {
                        OR: keywords.length
                            ? keywords.map((k) => ({ content: { contains: k } }))
                            : undefined,
                    },
                    select: { content: true, role: true },
                    orderBy: { insertedAt: 'desc' },
                    take: 30,
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });
        for (const conv of unifiedConvs) {
            const text = conv.messages
                .map((m) => `【${m.role}】${m.content}`)
                .join('\n');
            if (text.trim()) {
                chunks.push({ conversationId: conv.id, conversationTitle: conv.title, text });
            }
        }
    }
    catch {
        // ignore
    }
    // 3. 从知识卡片中检索
    try {
        const cards = await prisma.knowledgeCard.findMany({
            where: {
                userId,
                OR: keywords.length
                    ? [
                        ...keywords.map((k) => ({ title: { contains: k } })),
                        ...keywords.map((k) => ({ content: { contains: k } })),
                    ]
                    : undefined,
            },
            select: { id: true, title: true, content: true, conversationId: true },
            take: 30,
        });
        for (const card of cards) {
            chunks.push({
                conversationId: card.conversationId,
                conversationTitle: card.title,
                text: `【知识卡片】${card.title}\n${card.content}`,
            });
        }
    }
    catch {
        // ignore
    }
    // 截断到总长度限制
    let total = 0;
    const result = [];
    for (const c of chunks) {
        if (total + c.text.length > maxChars) {
            const remain = maxChars - total;
            if (remain > 200) {
                result.push({ ...c, text: c.text.slice(0, remain) });
            }
            break;
        }
        result.push(c);
        total += c.text.length;
    }
    return result;
}
// ═══════════ 试卷生成 ═══════════
const TYPE_LABELS = {
    SINGLE_CHOICE: '单选题',
    MULTIPLE_CHOICE: '多选题',
    TRUE_FALSE: '判断题',
    FILL_BLANK: '填空题',
    SHORT_ANSWER: '简答题',
};
/**
 * 基于用户知识库与用户描述的需求，生成一张试卷与参考答案。
 */
export async function generateTestPaper(userId, requirement, opts = {}) {
    const questionCount = opts.questionCount ?? 10;
    const difficulty = opts.difficulty ?? 'medium';
    const types = opts.types?.length
        ? opts.types
        : ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER'];
    // 检索知识
    const knowledge = await retrieveUserKnowledge(userId, requirement);
    if (knowledge.length === 0) {
        throw new Error('知识库中未找到与需求相关的内容，请先导入对话或生成知识卡片');
    }
    const knowledgeText = knowledge
        .map((c, i) => `--- 片段 ${i + 1}（来源：${c.conversationTitle}）---\n${c.text}`)
        .join('\n\n');
    const typeList = types.map((t) => TYPE_LABELS[t]).join('、');
    const systemPrompt = `你是一位资深的考试命题专家。请根据用户提供的知识库内容和需求描述，生成一张高质量的试卷与参考答案。

严格要求：
1. 所有题目必须基于知识库内容，不得编造知识库中不存在的知识点
2. 每道题必须有参考答案和详细解析
3. 题目难度分布合理，覆盖核心知识点
4. 返回严格的 JSON 格式，不要有任何额外文字

JSON 格式：
{
  "title": "试卷标题",
  "description": "试卷说明",
  "subject": "学科/主题",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "type": "SINGLE_CHOICE|MULTIPLE_CHOICE|TRUE_FALSE|FILL_BLANK|SHORT_ANSWER",
      "content": "题干",
      "options": [{"key":"A","text":"选项A"},{"key":"B","text":"选项B"}],
      "answer": "A" 或 ["A","C"] 或 true 或 ["答案1","答案2"] 或 "简答题参考答案",
      "explanation": "答案解析",
      "score": 10
    }
  ]
}

题型说明：
- SINGLE_CHOICE：单选题，answer 为单个字母字符串
- MULTIPLE_CHOICE：多选题，answer 为字母数组
- TRUE_FALSE：判断题，answer 为 true/false
- FILL_BLANK：填空题，answer 为答案数组
- SHORT_ANSWER：简答题，answer 为参考答案文本`;
    const userPrompt = `用户需求：${requirement}

期望题量：约 ${questionCount} 题
期望题型：${typeList}
难度：${difficulty === 'easy' ? '简单' : difficulty === 'hard' ? '困难' : '中等'}

知识库内容：
${knowledgeText}`;
    const raw = await callDeepseek({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        responseFormat: { type: 'json_object' },
        temperature: 0.7,
        maxTokens: 8192,
    });
    let parsed;
    try {
        parsed = JSON.parse(raw.content);
    }
    catch {
        const match = raw.content.match(/\{[\s\S]*\}/);
        if (!match)
            throw new Error('AI 返回格式异常，无法解析试卷');
        parsed = JSON.parse(match[0]);
    }
    // 校验并规范化
    const questions = [];
    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    for (const q of rawQuestions) {
        const type = q.type;
        if (!type || !TYPE_LABELS[type])
            continue;
        const content = typeof q.content === 'string' ? q.content : '';
        if (!content.trim())
            continue;
        const question = {
            type,
            content,
            options: Array.isArray(q.options) ? q.options : undefined,
            answer: q.answer,
            explanation: typeof q.explanation === 'string' ? q.explanation : '',
            score: typeof q.score === 'number' ? q.score : 10,
        };
        questions.push(question);
    }
    if (questions.length === 0) {
        throw new Error('AI 未能生成有效题目，请重试');
    }
    return {
        title: typeof parsed.title === 'string' ? parsed.title : 'AI 记忆试卷',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
        difficulty,
        questions,
    };
}
/**
 * 将生成的试卷持久化到数据库。
 */
export async function saveTestPaper(userId, paper, scope) {
    const totalScore = paper.questions.reduce((sum, q) => sum + q.score, 0);
    const created = await prisma.testPaper.create({
        data: {
            userId,
            title: paper.title,
            description: paper.description,
            subject: paper.subject,
            difficulty: paper.difficulty,
            questionCount: paper.questions.length,
            totalScore,
            status: 'READY',
            scope: scope || undefined,
            questions: {
                create: paper.questions.map((q, idx) => ({
                    orderIndex: idx,
                    type: q.type,
                    content: q.content,
                    options: q.options,
                    answer: q.answer,
                    explanation: q.explanation,
                    score: q.score,
                    sourceConvId: q.sourceConvId,
                    sourceSnippet: q.sourceSnippet,
                })),
            },
        },
        select: { id: true },
    });
    return created.id;
}
//# sourceMappingURL=testPaperService.js.map