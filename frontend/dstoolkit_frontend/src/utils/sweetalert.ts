/**
 * SweetAlert2 封装
 * 提供语义化 API：confirm / prompt / toast 等常用交互
 */
import Swal from 'sweetalert2'
import type { SweetAlertOptions, SweetAlertResult } from 'sweetalert2'

/** 全局默认配置 */
const swalBase = Swal.mixin({
  reverseButtons: true,
  confirmButtonText: '确定',
  cancelButtonText: '取消',
  // 官方无动画写法：置空 showClass/hideClass，关闭时走立即移除路径
  // （避免动画结束事件不触发导致弹窗残留）
  showClass: { popup: '', backdrop: '' },
  hideClass: { popup: '', backdrop: '' },
  customClass: {
    popup: 'sweet-popup',
    title: 'sweet-title',
    confirmButton: 'sweet-btn-confirm',
    cancelButton: 'sweet-btn-cancel',
  },
  buttonsStyling: false,
})

/**
 * 二次确认框：返回 boolean 表示是否确认
 */
export async function confirm(
  title: string,
  text?: string,
  opts: SweetAlertOptions = {} as SweetAlertOptions
): Promise<boolean> {
  const res: SweetAlertResult = await swalBase.fire({
    ...({
      icon: 'warning',
      title,
      text,
      showCancelButton: true,
    } as SweetAlertOptions),
    ...opts,
  } as SweetAlertOptions)
  return Boolean(res.isConfirmed)
}

/**
 * 删除确认框：红色调 + 危险提示
 */
export async function confirmDanger(
  title: string = '确定要删除吗？',
  text: string = '此操作不可撤销，请谨慎操作。',
  opts: SweetAlertOptions = {} as SweetAlertOptions
): Promise<boolean> {
  const res: SweetAlertResult = await swalBase.fire({
    ...({
      icon: 'error',
      title,
      text,
      showCancelButton: true,
      confirmButtonText: '删除',
    } as SweetAlertOptions),
    ...opts,
  } as SweetAlertOptions)
  return Boolean(res.isConfirmed)
}

/**
 * 成功提示：轻量弹窗（自动关闭）
 */
export function success(
  title: string,
  text?: string,
  opts: SweetAlertOptions = {} as SweetAlertOptions
): Promise<SweetAlertResult> {
  return swalBase.fire({
    ...({
      icon: 'success',
      title,
      text,
      timer: 1800,
      timerProgressBar: true,
      showConfirmButton: false,
    } as SweetAlertOptions),
    ...opts,
  } as SweetAlertOptions)
}

/**
 * 错误弹窗
 */
export function error(
  title: string = '操作失败',
  text?: string,
  opts: SweetAlertOptions = {} as SweetAlertOptions
): Promise<SweetAlertResult> {
  return swalBase.fire({
    ...({
      icon: 'error',
      title,
      text,
    } as SweetAlertOptions),
    ...opts,
  } as SweetAlertOptions)
}

/**
 * 输入框（Prompt）：返回用户输入的字符串，取消返回 null
 */
export async function prompt(
  title: string,
  opts: SweetAlertOptions & {
    inputType?: 'text' | 'password' | 'email' | 'number' | 'textarea'
    placeholder?: string
    required?: boolean
  } = {} as SweetAlertOptions
): Promise<string | null> {
  const { inputType = 'text', placeholder, required, ...rest } = opts
  const res: SweetAlertResult = await swalBase.fire({
    ...({
      title,
      input: inputType,
      inputPlaceholder: placeholder,
      inputAttributes: required ? ({ required: 'required' } as Record<string, unknown>) : {},
      showCancelButton: true,
      inputValidator: (value: unknown) => {
        if (required && !value) return '此项为必填项'
        return null
      },
    } as SweetAlertOptions),
    ...(rest as SweetAlertOptions),
  } as SweetAlertOptions)
  if (res.isConfirmed) {
    return (res.value as string) ?? null
  }
  return null
}

/** 导出原始 Swal 便于自定义场景使用 */
export { swalBase as Swal }
