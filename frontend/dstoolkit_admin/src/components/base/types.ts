/**
 * BaseTable 类型定义（独立于 .vue 文件，便于外部 import 与 IDE 解析）
 * 参考 https://www.cnblogs.com/gccbuaa/p/19484120 的列预设思路
 */
export type ColumnType = 'index' | 'action' | 'short' | 'normal' | 'long' | 'time' | 'status'

export interface ColumnPreset {
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  showOverflowTooltip?: boolean
}

export interface BaseTableColumn {
  prop?: string
  label?: string
  type?: ColumnType
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  showOverflowTooltip?: boolean
  /** Element Plus 原生 formatter：(row, column, cellValue, index) => string */
  formatter?: (row: any, column: any, cellValue: any, index: number) => string
  /** 具名插槽名，用于自定义列内容（操作列、状态标签等） */
  slot?: string
}

/** BaseTable 通过 defineExpose 暴露的方法集合，供 ref 类型标注使用 */
export interface BaseTableInstance {
  fetchList: () => Promise<void>
}
