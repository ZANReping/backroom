// ================= v54：设计模式数据提取——导出组装（DESIGN-GUIDE.md §1）=================
// 把提取到的布局/图鉴条目包上 format 版本标识与导出时间，得到可直接 JSON.stringify 的设计文件。
import type { CodexEntry, DesignFile, LayoutEntry } from './types'

/** 设计文件格式版本标识（不一致先停下核对，见 DESIGN-GUIDE.md §1） */
export const DESIGN_FORMAT = 'backroom-design/v1' as const

/** 组装设计文件（layouts/codex 可同时或单独提供；exportedAt 取当前时间 ISO 8601） */
export function buildDesignFile(layouts: LayoutEntry[], codex: CodexEntry[]): DesignFile {
  return { format: DESIGN_FORMAT, exportedAt: new Date().toISOString(), layouts, codex }
}
