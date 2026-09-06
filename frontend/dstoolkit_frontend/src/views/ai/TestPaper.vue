<script setup lang="ts">
/**
 * 记忆试卷页 - 基于知识库生成试卷与参考答案
 *  - 描述需求 → 配置题量/难度/题型 → 生成
 *  - 试卷列表 + 详情（答题 + 查看答案 + 解析）
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MagicStick,
  Refresh,
  View,
  Delete,
  Check,
  Close,
  Document,
} from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import type { TestPaper, TestPaperQuestion, QuestionType } from '@/types'

const papers = ref<TestPaper[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

// 生成表单
const genDialog = ref(false)
const requirement = ref('')
const questionCount = ref(10)
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium')
const selectedTypes = ref<QuestionType[]>([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'SHORT_ANSWER',
])
const generating = ref(false)

// 详情
const detailDialog = ref(false)
const activePaper = ref<TestPaper | null>(null)
const showAnswers = ref(false)
// 用户答案
const userAnswers = ref<Record<string, any>>({})

const TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTIPLE_CHOICE', label: '多选题' },
  { value: 'TRUE_FALSE', label: '判断题' },
  { value: 'FILL_BLANK', label: '填空题' },
  { value: 'SHORT_ANSWER', label: '简答题' },
]

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

const STATUS_LABELS: Record<string, { text: string; type: string }> = {
  GENERATING: { text: '生成中', type: 'warning' },
  READY: { text: '已就绪', type: 'success' },
  FAILED: { text: '失败', type: 'danger' },
}

async function loadPapers() {
  loading.value = true
  try {
    const res: any = await request.get('/test-papers', {
      params: { page: page.value, pageSize },
    })
    papers.value = res.papers || []
    total.value = res.total || 0
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function generatePaper() {
  if (!requirement.value.trim()) {
    ElMessage.warning('请描述你想测试的知识点或需求')
    return
  }
  if (selectedTypes.value.length === 0) {
    ElMessage.warning('请至少选择一种题型')
    return
  }
  generating.value = true
  try {
    const res: any = await request.post('/test-papers/generate', {
      requirement: requirement.value,
      questionCount: questionCount.value,
      difficulty: difficulty.value,
      types: selectedTypes.value,
    })
    ElMessage.success('试卷生成中，请稍候...')
    genDialog.value = false
    requirement.value = ''
    // 轮询任务状态
    await pollJob(res.jobId)
  } catch {
    // ignore
  } finally {
    generating.value = false
  }
}

async function pollJob(jobId: string) {
  const maxAttempts = 60
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res: any = await request.get(`/test-papers/job/${jobId}`)
      if (res.status === 'done') {
        ElMessage.success('试卷生成完成！')
        loadPapers()
        return
      }
      if (res.status === 'failed') {
        ElMessage.error(`生成失败：${res.error || '未知错误'}`)
        loadPapers()
        return
      }
    } catch {
      return
    }
  }
  ElMessage.info('生成时间较长，请稍后在列表中查看结果')
  loadPapers()
}

async function openDetail(id: number) {
  try {
    const res: any = await request.get(`/test-papers/${id}`)
    activePaper.value = res.paper
    userAnswers.value = {}
    showAnswers.value = false
    detailDialog.value = true
  } catch {
    // ignore
  }
}

async function deletePaper(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该试卷？', '提示', { type: 'warning' })
    await request.delete(`/test-papers/${id}`)
    ElMessage.success('已删除')
    loadPapers()
  } catch {
    // ignore
  }
}

const score = computed(() => {
  if (!activePaper.value || !showAnswers.value) return 0
  let s = 0
  for (const q of activePaper.value.questions || []) {
    const ua = userAnswers.value[q.id]
    if (isAnswerCorrect(q, ua)) s += q.score
  }
  return s
})

function isAnswerCorrect(q: TestPaperQuestion, ua: any): boolean {
  if (ua === undefined || ua === null || ua === '') return false
  const ans = q.answer
  switch (q.type) {
    case 'SINGLE_CHOICE':
      return String(ua).toUpperCase() === String(ans).toUpperCase()
    case 'MULTIPLE_CHOICE': {
      const a = Array.isArray(ans) ? ans.map((x: string) => x.toUpperCase()).sort() : []
      const u = Array.isArray(ua) ? ua.map((x: string) => x.toUpperCase()).sort() : []
      return JSON.stringify(a) === JSON.stringify(u)
    }
    case 'TRUE_FALSE':
      return Boolean(ua) === Boolean(ans)
    case 'FILL_BLANK': {
      const a = Array.isArray(ans) ? ans : [ans]
      const u = Array.isArray(ua) ? ua : [ua]
      return a.every((x: string, i: number) => String(x).trim() === String(u[i] || '').trim())
    }
    case 'SHORT_ANSWER':
      // 简答题不自动判分
      return false
  }
}

onMounted(loadPapers)
</script>

<template>
  <div class="test-paper-page">
    <!-- 顶部操作 -->
    <div class="toolbar">
      <el-button type="primary" :icon="MagicStick" size="large" @click="genDialog = true">
        生成记忆试卷
      </el-button>
      <el-button :icon="Refresh" @click="loadPapers">刷新</el-button>
    </div>

    <!-- 试卷列表 -->
    <el-card shadow="never">
      <el-table :data="papers" v-loading="loading" stripe>
        <el-table-column prop="title" label="试卷标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="难度" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ DIFFICULTY_LABELS[row.difficulty] || row.difficulty }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="questionCount" label="题数" width="70" align="center" />
        <el-table-column prop="totalScore" label="总分" width="70" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_LABELS[row.status]?.type as any" size="small">
              {{ STATUS_LABELS[row.status]?.text || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'READY'"
              text
              type="primary"
              :icon="View"
              @click="openDetail(row.id)"
            >
              查看
            </el-button>
            <el-button text type="danger" :icon="Delete" @click="deletePaper(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="total > pageSize" class="pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="loadPapers"
        />
      </div>
    </el-card>

    <!-- 生成弹窗 -->
    <el-dialog v-model="genDialog" title="生成记忆试卷" width="560px">
      <el-form label-position="top">
        <el-form-item label="描述你想测试的知识点或需求">
          <el-input
            v-model="requirement"
            type="textarea"
            :rows="4"
            placeholder="例如：我想测试自己对 React Hooks 的理解，包括 useState、useEffect、useMemo 的区别和使用场景"
          />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="题量">
              <el-input-number v-model="questionCount" :min="1" :max="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="难度">
              <el-select v-model="difficulty" style="width: 100%">
                <el-option label="简单" value="easy" />
                <el-option label="中等" value="medium" />
                <el-option label="困难" value="hard" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="题型（可多选）">
          <el-checkbox-group v-model="selectedTypes">
            <el-checkbox v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">
              {{ t.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialog = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="generatePaper">
          生成试卷
        </el-button>
      </template>
    </el-dialog>

    <!-- 试卷详情弹窗 -->
    <el-dialog v-model="detailDialog" :title="activePaper?.title || '试卷详情'" width="720px" top="5vh">
      <div v-if="activePaper" class="paper-detail">
        <div class="paper-meta">
          <el-tag>{{ DIFFICULTY_LABELS[activePaper.difficulty] }}</el-tag>
          <span>{{ activePaper.questionCount }} 题 / {{ activePaper.totalScore }} 分</span>
          <span v-if="activePaper.subject">科目：{{ activePaper.subject }}</span>
        </div>
        <p v-if="activePaper.description" class="paper-desc">{{ activePaper.description }}</p>

        <div class="questions">
          <div v-for="q in activePaper.questions" :key="q.id" class="question">
            <div class="q-header">
              <span class="q-index">{{ q.orderIndex + 1 }}.</span>
              <el-tag size="small" type="info">{{ TYPE_OPTIONS.find(t => t.value === q.type)?.label }}</el-tag>
              <span class="q-score">{{ q.score }} 分</span>
            </div>
            <div class="q-content">{{ q.content }}</div>

            <!-- 选项 -->
            <div v-if="q.options?.length" class="q-options">
              <el-radio-group
                v-if="q.type === 'SINGLE_CHOICE'"
                v-model="userAnswers[q.id]"
              >
                <el-radio v-for="opt in q.options" :key="opt.key" :value="opt.key">
                  {{ opt.key }}. {{ opt.text }}
                </el-radio>
              </el-radio-group>
              <el-checkbox-group
                v-else-if="q.type === 'MULTIPLE_CHOICE'"
                v-model="userAnswers[q.id]"
              >
                <el-checkbox v-for="opt in q.options" :key="opt.key" :value="opt.key">
                  {{ opt.key }}. {{ opt.text }}
                </el-checkbox>
              </el-checkbox-group>
            </div>

            <!-- 判断题 -->
            <el-radio-group v-if="q.type === 'TRUE_FALSE'" v-model="userAnswers[q.id]">
              <el-radio :value="true">正确</el-radio>
              <el-radio :value="false">错误</el-radio>
            </el-radio-group>

            <!-- 填空题 -->
            <div v-if="q.type === 'FILL_BLANK'" class="q-fill">
              <el-input
                v-for="(_, idx) in (Array.isArray(q.answer) ? q.answer.length : 1)"
                :key="idx"
                v-model="userAnswers[q.id + '_' + idx]"
                :placeholder="'空 ' + (idx + 1)"
                style="margin-bottom: 8px"
              />
            </div>

            <!-- 简答题 -->
            <el-input
              v-if="q.type === 'SHORT_ANSWER'"
              v-model="userAnswers[q.id]"
              type="textarea"
              :rows="3"
              placeholder="请输入你的答案"
            />

            <!-- 答案与解析 -->
            <div v-if="showAnswers" class="q-answer">
              <div class="answer-row">
                <span class="answer-label">参考答案：</span>
                <span class="answer-value">
                  {{ Array.isArray(q.answer) ? q.answer.join(', ') : q.answer }}
                </span>
                <el-icon v-if="q.type !== 'SHORT_ANSWER'" :color="isAnswerCorrect(q, userAnswers[q.id]) ? '#67c23a' : '#f56c6c'">
                  <Check v-if="isAnswerCorrect(q, userAnswers[q.id])" />
                  <Close v-else />
                </el-icon>
              </div>
              <div v-if="q.explanation" class="q-explanation">
                <strong>解析：</strong>{{ q.explanation }}
              </div>
            </div>
          </div>
        </div>

        <div class="detail-footer">
          <el-button v-if="!showAnswers" type="primary" @click="showAnswers = true">
            提交并查看答案
          </el-button>
          <template v-else>
            <el-result
              v-if="score > 0"
              :title="`得分：${score} / ${activePaper.totalScore}`"
              sub-title="简答题需自行对照参考答案评分"
              :icon="Document"
            />
            <el-button @click="showAnswers = false">重新答题</el-button>
          </template>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.test-paper-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.paper-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.paper-desc {
  color: var(--el-text-color-regular);
  margin: 8px 0 16px;
}
.questions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.question {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.q-index {
  font-weight: 600;
}
.q-score {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.q-content {
  margin-bottom: 12px;
  line-height: 1.6;
}
.q-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q-fill {
  display: flex;
  flex-direction: column;
}
.q-answer {
  margin-top: 12px;
  padding: 10px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
}
.answer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.answer-label {
  font-weight: 600;
  color: var(--el-color-success);
}
.answer-value {
  flex: 1;
}
.q-explanation {
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}
.detail-footer {
  margin-top: 20px;
  text-align: center;
}
@media (max-width: 768px) {
  .q-options :deep(.el-radio),
  .q-options :deep(.el-checkbox) {
    display: block;
    margin: 4px 0;
  }
}
</style>
