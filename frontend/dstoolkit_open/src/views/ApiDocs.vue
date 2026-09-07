<script setup lang="ts">
import { ref } from 'vue'
import { Document } from '@element-plus/icons-vue'

const activeSection = ref('overview')

const sections = [
  { id: 'overview', label: '总览' },
  { id: 'authentication', label: '认证' },
  { id: 'endpoints', label: '端点' },
  { id: 'pagination', label: '分页' },
  { id: 'errors', label: '错误' },
]

const endpoints = [
  { method: 'GET', path: '/api/v1/me', desc: '当前令牌所属用户信息' },
  { method: 'GET', path: '/api/v1/configs', desc: '列出当前用户的全部配置' },
  { method: 'GET', path: '/api/v1/configs/:id/conversations', desc: '分页返回会话元数据（lite）' },
  { method: 'GET', path: '/api/v1/configs/:id/conversations/:convId', desc: '单个会话完整 messages + turns' },
  { method: 'GET', path: '/api/v1/search', desc: '搜索消息内容与会话标题' },
  { method: 'GET', path: '/api/v1/stats', desc: '当前用户的数据统计' },
]

const methodColor: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  DELETE: '#ef4444',
}

function scrollTo(id: string) {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="docs-page">
    <el-row :gutter="20">
      <el-col :xs="0" :sm="6" :md="5">
        <el-card shadow="never" class="toc-card">
          <div class="toc-title">
            <el-icon :size="16"><Document /></el-icon>
            文档目录
          </div>
          <div
            v-for="s in sections"
            :key="s.id"
            class="toc-item"
            :class="{ active: activeSection === s.id }"
            @click="scrollTo(s.id)"
          >
            {{ s.label }}
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="18" :md="19">
        <div id="overview" class="doc-section">
          <h2>API 总览</h2>
          <p>所有 API 端点位于 <code class="code-text">/api/v1</code> 前缀下，需通过访问令牌鉴权。</p>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="访问令牌在「API 令牌」页面生成，格式为 dstk_ 前缀。"
          />
        </div>

        <div id="authentication" class="doc-section">
          <h2>认证与令牌</h2>
          <p>所有 <code class="code-text">/api/v1/*</code> 端点都需要有效的访问令牌。令牌体系独立于 Web 端登录用的 JWT——API 令牌用于程序化访问。</p>

          <h3>令牌格式</h3>
          <ul>
            <li>前缀：<code class="code-text">dstk_</code>（便于识别与误用检测）</li>
            <li>主体：24 字节密码学随机数，十六进制编码（48 字符）</li>
            <li>示例：<code class="code-text">dstk_bbe3fd95864d864ee29c8f12b8c96ba92cfe9cacb0fed0b4</code></li>
          </ul>

          <h3>鉴权方式</h3>
          <p>在每个请求头中携带：</p>
          <pre class="code-block">Authorization: Bearer dstk_xxxxxxxx...</pre>

          <h3>安全实践</h3>
          <ul>
            <li>令牌明文<strong>仅在创建时返回一次</strong>，服务端只存哈希，无法事后读取。</li>
            <li>请将令牌视为密码妥善保存，推荐使用环境变量或密钥管理服务。</li>
            <li>令牌按用户隔离，仅能访问归属当前用户的数据。</li>
            <li>怀疑泄露时，立即撤销对应令牌。</li>
          </ul>
        </div>

        <div id="endpoints" class="doc-section">
          <h2>端点一览</h2>
          <el-table :data="endpoints" stripe size="small">
            <el-table-column label="方法" width="80">
              <template #default="{ row }">
                <el-tag :color="methodColor[row.method]" effect="dark" size="small" style="border: none;">
                  {{ row.method }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="路径" min-width="280">
              <template #default="{ row }">
                <code class="code-text">{{ row.path }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="desc" label="说明" min-width="200" />
          </el-table>
        </div>

        <div id="pagination" class="doc-section">
          <h2>分页约定</h2>
          <p>列表端点统一采用以下查询参数：</p>
          <el-table :data="[
            { param: 'page', type: 'number', def: '1', desc: '页码，从 1 开始' },
            { param: 'pageSize', type: 'number', def: '50', desc: '每页条数，上限 500' },
          ]" stripe size="small">
            <el-table-column prop="param" label="参数" width="120" />
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="def" label="默认" width="80" />
            <el-table-column prop="desc" label="说明" />
          </el-table>

          <p style="margin-top: 16px;">分页响应体结构：</p>
          <pre class="code-block">{
  "records": [ /* 当前页数据 */ ],
  "total": 9154,
  "page": 1,
  "pageSize": 20
}</pre>
        </div>

        <div id="errors" class="doc-section">
          <h2>错误响应</h2>
          <p>所有错误响应均为如下结构，并附带合适的 HTTP 状态码：</p>
          <pre class="code-block">{ "error": "错误描述" }</pre>

          <el-table :data="[
            { code: '200', desc: '成功' },
            { code: '401', desc: '未认证 / 令牌无效或过期' },
            { code: '404', desc: '资源不存在或不属于当前用户' },
            { code: '500', desc: '服务器内部错误' },
          ]" stripe size="small">
            <el-table-column prop="code" label="状态码" width="120" />
            <el-table-column prop="desc" label="含义" />
          </el-table>

          <h3 style="margin-top: 20px;">鉴权错误详情</h3>
          <el-table :data="[
            { scene: '未携带令牌', code: '401', msg: '缺少访问令牌...' },
            { scene: '格式错误（非 dstk_ 前缀）', code: '401', msg: '令牌格式错误，应以 dstk_ 开头' },
            { scene: '令牌不存在或已删除', code: '401', msg: '令牌无效或已删除' },
            { scene: '令牌已过期', code: '401', msg: '令牌已过期' },
          ]" stripe size="small">
            <el-table-column prop="scene" label="场景" min-width="200" />
            <el-table-column prop="code" label="HTTP" width="80" />
            <el-table-column prop="msg" label="响应 error" min-width="220" />
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.docs-page {
  max-width: 1100px;
}
.toc-card {
  position: sticky;
  top: 0;
  border-radius: 10px;
}
.toc-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 8px;
}
.toc-item {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
}
.toc-item:hover {
  background: var(--el-fill-color);
}
.toc-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}
.doc-section {
  background: var(--el-bg-color);
  border-radius: 10px;
  padding: 24px;
  margin-bottom: 16px;
}
.doc-section h2 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
}
.doc-section h3 {
  margin: 20px 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.doc-section p {
  color: var(--el-text-color-regular);
  line-height: 1.7;
}
.doc-section ul {
  padding-left: 20px;
  line-height: 2;
  color: var(--el-text-color-regular);
}
.code-block {
  background: var(--el-fill-color-dark);
  padding: 14px 16px;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  overflow-x: auto;
  line-height: 1.6;
}
@media (max-width: 768px) {
  .doc-section {
    padding: 16px;
  }
}
</style>
