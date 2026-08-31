<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
  Box,
  Brush,
  ChatDotRound,
  Grid,
  Lightning,
  Notebook,
  Open,
  Operation,
  Star,
} from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import type { MarketEntry } from '@/types'

const entries = ref<MarketEntry[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res: any = await request.get('/market')
    entries.value = (res.entries ?? []) as MarketEntry[]
  } finally {
    loading.value = false
  }
}

// 分类图标映射（颜色统一使用 Element Plus 主题变量）
const DEFAULT_ICON: Component = Star
const CATEGORY_ICONS: Record<string, Component> = {
  开发工具: Operation,
  学习资源: Notebook,
  创意设计: Brush,
  效率工具: Lightning,
  社区交流: ChatDotRound,
  基础设施: Box,
  模型插件: Grid,
}

function categoryIcon(category: string): Component {
  return CATEGORY_ICONS[category] ?? DEFAULT_ICON
}

// 按 category 分组（保持接口返回顺序）
const groups = computed<{ category: string; items: MarketEntry[] }[]>(() => {
  const map = new Map<string, MarketEntry[]>()
  for (const e of entries.value) {
    const key = e.category || '其他'
    const list = map.get(key)
    if (list) list.push(e)
    else map.set(key, [e])
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
})

onMounted(load)
</script>

<template>
  <div class="market-page">
    <!-- 页头 -->
    <el-card shadow="never" class="page-head-card">
      <div class="page-head">
        <div>
          <h2 class="page-title">模型市场</h2>
          <p class="page-sub">浏览并使用各类模型资源，扩展对话能力</p>
        </div>
        <el-tag type="primary" effect="plain" size="large" round>
          <el-icon :size="12" style="margin-right: 4px;"><Star /></el-icon>
          {{ entries.length }} 个资源可用
        </el-tag>
      </div>
    </el-card>

    <!-- 列表 -->
    <div v-loading="loading" class="market-body">
      <el-empty
        v-if="!loading && entries.length === 0"
        description="暂无收录资源"
        :image-size="90"
      />

      <section
        v-for="g in groups"
        :key="g.category"
        class="market-section"
      >
        <div class="section-head">
          <div class="section-icon">
            <el-icon :size="16"><component :is="categoryIcon(g.category)" /></el-icon>
          </div>
          <h3 class="section-title">{{ g.category }}</h3>
          <el-tag size="small" type="info" effect="plain" round>{{ g.items.length }}</el-tag>
        </div>

        <div class="market-grid">
          <!-- 整卡为外链：点击任意位置（含"使用"按钮）均在新标签页打开资源地址 -->
          <a
            v-for="e in g.items"
            :key="e.id"
            :href="e.url"
            target="_blank"
            rel="noopener noreferrer"
            class="market-card-link"
          >
            <el-card shadow="hover" class="market-card">
              <div class="card-head">
                <div class="card-icon">
                  <el-icon :size="20"><component :is="categoryIcon(e.category)" /></el-icon>
                </div>
                <div class="card-head-text">
                  <h3 class="card-name">
                    {{ e.name }}
                    <el-icon :size="13" class="card-open-icon"><Open /></el-icon>
                  </h3>
                  <el-tag size="small" effect="plain" type="info">{{ e.category }}</el-tag>
                </div>
              </div>

              <p class="card-desc">{{ e.description || '暂无描述，点击查看更多' }}</p>

              <div class="card-foot">
                <span class="foot-tag">
                  <el-icon :size="13"><Star /></el-icon>
                  推荐
                </span>
                <el-button size="small" type="primary" @click.stop>
                  <el-icon :size="13" style="margin-right: 4px;"><Open /></el-icon>
                  使用
                </el-button>
              </div>
            </el-card>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.market-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页头 */
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.page-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.market-body {
  min-height: 200px;
}

/* 分组 */
.market-section {
  margin-bottom: 8px;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.section-icon {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 卡片网格 */
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.market-card-link {
  text-decoration: none;
  display: block;
}
.market-card {
  cursor: pointer;
  height: 100%;
}
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.card-head-text {
  flex: 1;
  min-width: 0;
}
.card-name {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-open-icon {
  color: var(--el-text-color-secondary);
}
.card-desc {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  min-height: 42px;
}
.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.foot-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-color-warning);
}

@media (max-width: 720px) {
  .market-grid {
    grid-template-columns: 1fr;
  }
}
</style>
