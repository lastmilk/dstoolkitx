<script setup lang="ts">
/**
 * Agent 工具管理 - Skills (Skill.md) + MCP 服务器
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, MagicStick, Connection } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import type { Skill, McpServer } from '@/types'

const activeTab = ref<'skills' | 'mcp'>('skills')

// Skills
const skills = ref<Skill[]>([])
const skillDialog = ref(false)
const editingSkill = ref<Skill | null>(null)
const skillForm = ref({ name: '', description: '', content: '', tags: [] as string[], enabled: true })

// MCP
const mcps = ref<McpServer[]>([])
const mcpDialog = ref(false)
const editingMcp = ref<McpServer | null>(null)
const mcpForm = ref({
  name: '',
  description: '',
  transport: 'HTTP' as 'HTTP' | 'STDIO',
  url: '',
  command: '',
  args: [] as string[],
  headers: {} as Record<string, string>,
  enabled: true,
})
const mcpHeadersText = ref('')

async function loadSkills() {
  try {
    const res: any = await request.get('/skills')
    skills.value = res.skills || []
  } catch {
    // ignore
  }
}

function openSkillDialog(skill?: Skill) {
  if (skill) {
    editingSkill.value = skill
    skillForm.value = {
      name: skill.name,
      description: skill.description || '',
      content: skill.content,
      tags: (skill.tags as string[]) || [],
      enabled: skill.enabled,
    }
  } else {
    editingSkill.value = null
    skillForm.value = { name: '', description: '', content: '', tags: [], enabled: true }
  }
  skillDialog.value = true
}

async function saveSkill() {
  if (!skillForm.value.name.trim() || !skillForm.value.content.trim()) {
    ElMessage.warning('请填写名称和内容')
    return
  }
  try {
    if (editingSkill.value) {
      await request.put(`/skills/${editingSkill.value.id}`, skillForm.value)
      ElMessage.success('已更新')
    } else {
      await request.post('/skills', skillForm.value)
      ElMessage.success('已创建')
    }
    skillDialog.value = false
    loadSkills()
  } catch {
    // ignore
  }
}

async function deleteSkill(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该技能？', '提示', { type: 'warning' })
    await request.delete(`/skills/${id}`)
    ElMessage.success('已删除')
    loadSkills()
  } catch {
    // ignore
  }
}

async function toggleSkill(skill: Skill) {
  await request.put(`/skills/${skill.id}`, { enabled: !skill.enabled })
  skill.enabled = !skill.enabled
}

async function loadMcps() {
  try {
    const res: any = await request.get('/mcp')
    mcps.value = res.servers || []
  } catch {
    // ignore
  }
}

function openMcpDialog(mcp?: McpServer) {
  if (mcp) {
    editingMcp.value = mcp
    mcpForm.value = {
      name: mcp.name,
      description: mcp.description || '',
      transport: mcp.transport,
      url: mcp.url || '',
      command: mcp.command || '',
      args: (mcp.args as string[]) || [],
      headers: (mcp.headers as Record<string, string>) || {},
      enabled: mcp.enabled,
    }
  } else {
    editingMcp.value = null
    mcpForm.value = {
      name: '',
      description: '',
      transport: 'HTTP',
      url: '',
      command: '',
      args: [],
      headers: {},
      enabled: true,
    }
  }
  mcpHeadersText.value = JSON.stringify(mcpForm.value.headers, null, 2)
  mcpDialog.value = true
}

async function saveMcp() {
  if (!mcpForm.value.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  if (mcpForm.value.transport === 'HTTP' && !mcpForm.value.url.trim()) {
    ElMessage.warning('HTTP 模式必须填写 URL')
    return
  }
  // 解析 headers JSON
  if (mcpHeadersText.value.trim()) {
    try {
      mcpForm.value.headers = JSON.parse(mcpHeadersText.value)
    } catch {
      ElMessage.warning('Headers JSON 格式错误')
      return
    }
  } else {
    mcpForm.value.headers = {}
  }
  try {
    if (editingMcp.value) {
      await request.put(`/mcp/${editingMcp.value.id}`, mcpForm.value)
      ElMessage.success('已更新')
    } else {
      await request.post('/mcp', mcpForm.value)
      ElMessage.success('已创建')
    }
    mcpDialog.value = false
    loadMcps()
  } catch {
    // ignore
  }
}

async function deleteMcp(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该 MCP 服务器？', '提示', { type: 'warning' })
    await request.delete(`/mcp/${id}`)
    ElMessage.success('已删除')
    loadMcps()
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadSkills()
  loadMcps()
})
</script>

<template>
  <div class="tools-page">
    <el-tabs v-model="activeTab">
      <!-- Skills -->
      <el-tab-pane label="Skills 技能库" name="skills">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Plus" @click="openSkillDialog()">新建 Skill</el-button>
          <el-button :icon="Refresh" @click="loadSkills">刷新</el-button>
        </div>
        <el-table :data="skills" stripe>
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="启用" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="row.enabled" size="small" @change="toggleSkill(row)" />
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">
              {{ new Date(row.updatedAt).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" :icon="Edit" @click="openSkillDialog(row)">编辑</el-button>
              <el-button text type="danger" :icon="Delete" @click="deleteSkill(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="skills.length === 0" description="暂无 Skill，点击上方按钮创建" />
      </el-tab-pane>

      <!-- MCP -->
      <el-tab-pane label="MCP 服务器" name="mcp">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Plus" @click="openMcpDialog()">新建 MCP</el-button>
          <el-button :icon="Refresh" @click="loadMcps">刷新</el-button>
        </div>
        <el-table :data="mcps" stripe>
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
          <el-table-column label="传输" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ row.transport }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="地址/命令" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.transport === 'HTTP' ? row.url : row.command }}
            </template>
          </el-table-column>
          <el-table-column label="启用" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" :icon="Edit" @click="openMcpDialog(row)">编辑</el-button>
              <el-button text type="danger" :icon="Delete" @click="deleteMcp(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="mcps.length === 0" description="暂无 MCP 服务器，点击上方按钮创建" />
      </el-tab-pane>
    </el-tabs>

    <!-- Skill 编辑弹窗 -->
    <el-dialog v-model="skillDialog" :title="editingSkill ? '编辑 Skill' : '新建 Skill'" width="640px">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="skillForm.name" placeholder="例如：代码审查助手" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="skillForm.description" placeholder="简要描述这个技能的用途" />
        </el-form-item>
        <el-form-item label="Skill.md 内容">
          <el-input
            v-model="skillForm.content"
            type="textarea"
            :rows="12"
            placeholder="# 技能说明&#10;描述这个技能的能力、使用场景、注意事项等"
          />
        </el-form-item>
        <el-form-item label="标签（逗号分隔）">
          <el-input
            :model-value="skillForm.tags.join(',')"
            placeholder="代码, 审查"
            @input="(v: string) => (skillForm.tags = v.split(',').map(s => s.trim()).filter(Boolean))"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="skillForm.enabled">启用</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skillDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSkill">保存</el-button>
      </template>
    </el-dialog>

    <!-- MCP 编辑弹窗 -->
    <el-dialog v-model="mcpDialog" :title="editingMcp ? '编辑 MCP' : '新建 MCP'" width="560px">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="mcpForm.name" placeholder="例如：文件系统 MCP" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="mcpForm.description" placeholder="简要描述" />
        </el-form-item>
        <el-form-item label="传输方式">
          <el-radio-group v-model="mcpForm.transport">
            <el-radio value="HTTP">HTTP</el-radio>
            <el-radio value="STDIO">STDIO</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="mcpForm.transport === 'HTTP'" label="URL">
          <el-input v-model="mcpForm.url" placeholder="https://mcp.example.com/mcp" />
        </el-form-item>
        <el-form-item v-if="mcpForm.transport === 'STDIO'" label="启动命令">
          <el-input v-model="mcpForm.command" placeholder="npx -y @modelcontextprotocol/server-filesystem" />
        </el-form-item>
        <el-form-item v-if="mcpForm.transport === 'HTTP'" label="请求头（JSON）">
          <el-input
            v-model="mcpHeadersText"
            type="textarea"
            :rows="4"
            placeholder='{"Authorization": "Bearer xxx"}'
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mcpDialog = false">取消</el-button>
        <el-button type="primary" @click="saveMcp">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tools-page {
  display: flex;
  flex-direction: column;
}
.tab-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
</style>
