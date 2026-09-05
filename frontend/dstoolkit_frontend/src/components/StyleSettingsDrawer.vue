<script setup lang="ts">
/**
 * StyleSettingsDrawer 外观设置抽屉
 *  - 背景图：无背景 / 随机 ACG / 必应壁纸 / 自定义壁纸（≤15MB）
 *  - 透明度：控件透明度 + 背景图透明度
 *  - 字体大小：小 / 标准 / 大 / 特大（HarmonyOS Sans + --app-font-scale）
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { Hide, Picture, Compass, UploadFilled, Refresh, Delete } from '@element-plus/icons-vue'
import {
  useStyleStore,
  FONT_SIZE_OPTIONS,
  PARTICLE_DENSITY_OPTIONS,
  PARTICLE_STYLE_OPTIONS,
  WALLPAPER_BLUR_MAX,
  WALLPAPER_MAX_BYTES,
  type WallpaperType,
} from '@/stores/style'

const styleStore = useStyleStore()
defineEmits<{ close: [] }>()

const blurTooltip = (v: number) => (v === 0 ? '不模糊' : `${v}px`)
const blurLabel = computed(() =>
  styleStore.settings.wallpaperBlur === 0 ? '不模糊' : `${styleStore.settings.wallpaperBlur}px`,
)

/** 模糊快捷档位（点选即设值；滑块仍可 0-60 微调） */
const BLUR_PRESETS: Array<{ label: string; value: number }> = [
  { label: '不模糊', value: 0 },
  { label: '轻微', value: 5 },
  { label: '中等', value: 12 },
  { label: '较强', value: 24 },
  { label: '极强', value: 60 },
]

const wallpaperOptions: Array<{ label: string; desc: string; value: WallpaperType; icon: typeof Picture }> = [
  { label: '无背景', desc: '使用纯色主题', value: 'none', icon: Hide },
  { label: '随机 ACG', desc: '每次进入随机二次元图', value: 'acg', icon: Picture },
  { label: '必应壁纸', desc: '必应每日精选风景', value: 'bing', icon: Compass },
  { label: '自定义壁纸', desc: '上传本地图片（≤15MB）', value: 'custom', icon: UploadFilled },
]

const isRandom = computed(() => styleStore.settings.wallpaperType === 'acg' || styleStore.settings.wallpaperType === 'bing')
const isCustom = computed(() => styleStore.settings.wallpaperType === 'custom')

function onWallpaperSelect(type: WallpaperType) {
  styleStore.setWallpaper(type)
  void styleStore.refreshWallpaper()
}

function onRefresh() {
  void styleStore.refreshWallpaper()
}

async function onCustomFile(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  if (raw.size > WALLPAPER_MAX_BYTES) {
    ElMessage.warning('壁纸图片不能超过 15MB，请压缩后再上传')
    return
  }
  try {
    await styleStore.setCustomWallpaper(raw)
    ElMessage.success('自定义壁纸已应用')
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '壁纸保存失败')
  }
}

async function onClearCustom() {
  await styleStore.clearCustomWallpaper()
  ElMessage.success('已清除自定义壁纸')
}

function onReset() {
  styleStore.resetAll()
  ElMessage.success('已恢复默认外观')
}
</script>

<template>
  <el-drawer
    :model-value="true"
    title="外观设置"
    size="380px"
    :append-to-body="true"
    class="style-drawer"
    @update:model-value="$emit('close')"
  >
    <div class="style-body">
      <!-- ══════════ 背景图 ══════════ -->
      <div class="section-title">背景图</div>
      <div class="wp-grid">
        <button
          v-for="opt in wallpaperOptions"
          :key="opt.value"
          type="button"
          class="wp-option"
          :class="{ active: styleStore.settings.wallpaperType === opt.value }"
          @click="onWallpaperSelect(opt.value)"
        >
          <el-icon :size="20"><component :is="opt.icon" /></el-icon>
          <span class="wp-label">{{ opt.label }}</span>
          <span class="wp-desc">{{ opt.desc }}</span>
        </button>
      </div>

      <div v-if="isRandom" class="wp-actions">
        <el-button size="small" :loading="styleStore.wallpaperLoading" @click="onRefresh">
          <el-icon v-if="!styleStore.wallpaperLoading" style="margin-right: 4px;"><Refresh /></el-icon>
          换一张
        </el-button>
        <span v-if="styleStore.wallpaperError" class="wp-error">图片源加载失败，已退回直链模式</span>
      </div>

      <div v-if="isCustom" class="wp-actions wp-custom">
        <el-upload
          drag
          accept="image/*"
          :show-file-list="false"
          :auto-upload="false"
          @change="onCustomFile"
        >
          <el-icon :size="28" class="upload-icon"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽图片到此处，或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">支持 JPG / PNG / WebP，大小 15MB 以内</div>
          </template>
        </el-upload>
        <el-button
          v-if="styleStore.wallpaperUrl"
          size="small"
          type="danger"
          plain
          @click="onClearCustom"
        >
          <el-icon style="margin-right: 4px;"><Delete /></el-icon>
          清除自定义壁纸
        </el-button>
      </div>

      <!-- ══════════ 透明度 ══════════ -->
      <div class="section-title">透明度</div>
      <div class="slider-row">
        <span class="slider-label">控件透明度</span>
        <el-slider
          v-model="styleStore.settings.surfaceOpacity"
          :min="20"
          :max="100"
          :step="5"
          :format-tooltip="(v: number) => `${v}%`"
          class="slider"
        />
        <span class="slider-value">{{ styleStore.settings.surfaceOpacity }}%</span>
      </div>
      <div class="slider-hint">数值越低，侧栏 / 卡片越透明（有背景图时呈磨砂玻璃效果）</div>
      <div class="slider-row">
        <span class="slider-label">背景图透明度</span>
        <el-slider
          v-model="styleStore.settings.wallpaperOpacity"
          :min="0"
          :max="100"
          :step="5"
          :disabled="styleStore.settings.wallpaperType === 'none'"
          :format-tooltip="(v: number) => `${v}%`"
          class="slider"
        />
        <span class="slider-value">{{ styleStore.settings.wallpaperOpacity }}%</span>
      </div>
      <div class="slider-hint">控制背景图图层的可见程度</div>
      <div class="slider-row">
        <span class="slider-label">背景模糊度</span>
        <el-slider
          v-model="styleStore.settings.wallpaperBlur"
          :min="0"
          :max="WALLPAPER_BLUR_MAX"
          :step="1"
          :disabled="styleStore.settings.wallpaperType === 'none'"
          :format-tooltip="blurTooltip"
          class="slider"
        />
        <span class="slider-value">{{ blurLabel }}</span>
      </div>
      <div class="slider-hint">对背景图做高斯模糊；拉到最左或点「不模糊」档即完全清晰</div>
      <el-segmented
        :model-value="styleStore.settings.wallpaperBlur"
        :options="BLUR_PRESETS"
        size="small"
        class="blur-presets"
        @update:model-value="(v: number | string | boolean) => (styleStore.settings.wallpaperBlur = Number(v))"
      />

      <!-- ══════════ 粒子效果 ══════════ -->
      <div class="section-title particle-title">
        粒子效果
        <el-switch v-model="styleStore.settings.particlesEnabled" size="small" />
      </div>
      <template v-if="styleStore.settings.particlesEnabled">
        <div class="particle-row">
          <span class="slider-label">粒子样式</span>
          <el-segmented
            v-model="styleStore.settings.particleStyle"
            :options="PARTICLE_STYLE_OPTIONS"
            size="small"
            class="particle-segmented"
          />
        </div>
        <div class="particle-row">
          <span class="slider-label">粒子密度</span>
          <el-segmented
            v-model="styleStore.settings.particleDensity"
            :options="PARTICLE_DENSITY_OPTIONS"
            size="small"
            class="particle-segmented"
          />
        </div>
        <div class="slider-hint">主题色粒子绘制于内容层之下；雪花在暗色下为纯白、亮色下为淡蓝灰</div>
      </template>

      <!-- ══════════ 字体大小 ══════════ -->
      <div class="section-title">字体大小</div>
      <el-segmented
        v-model="styleStore.settings.fontSize"
        :options="FONT_SIZE_OPTIONS"
        block
      />

      <!-- ══════════ 恢复默认 ══════════ -->
      <div class="footer-actions">
        <el-button size="small" @click="onReset">恢复默认</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.style-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-top: 8px;
}

/* 背景图选项 2x2 网格 */
.wp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.wp-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background-color 0.2s;
  font-family: inherit;
}
.wp-option:hover {
  border-color: var(--el-color-primary-light-5);
}
.wp-option.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.wp-option .el-icon {
  margin-bottom: 4px;
}
.wp-label {
  font-size: 13px;
  font-weight: 600;
}
.wp-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.wp-option.active .wp-desc {
  color: var(--el-color-primary);
}

.wp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}
.wp-custom {
  flex-direction: column;
  align-items: stretch;
}
.wp-custom :deep(.el-upload-dragger) {
  padding: 18px 0;
}
.upload-icon {
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.wp-error {
  font-size: 11px;
  color: var(--el-color-danger);
}

/* 透明度滑块行 */
.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.slider-label {
  width: 76px;
  flex-shrink: 0;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.slider {
  flex: 1;
}
.slider-value {
  width: 40px;
  text-align: right;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.slider-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: -4px;
}

.particle-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.particle-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.particle-segmented {
  flex: 1;
}
.blur-presets {
  width: 100%;
}

.footer-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
</style>
