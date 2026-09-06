// 极验 GT4 Web 封装：Promise 化 bind 弹窗，成功返回二次校验四参数 + captcha_id。
// gt4.js 由 index.html <head> 引入；未配置 captcha_id 或脚本未就绪时直接放行
// （由后端 requireCaptcha 兜底提示）。

export interface GeetestParams {
  captcha_id: string
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

interface GeetestCaptcha {
  onSuccess: (cb: () => void) => void
  onError: (cb: (err: unknown) => void) => void
  onClose?: (cb: () => void) => void
  getValidate: () => GeetestParams | null
  showCaptcha: () => void
  destroy?: () => void
}

type InitGeetest4 = (
  config: Record<string, unknown>,
  callback: (captcha: GeetestCaptcha) => void,
) => void

declare global {
  interface Window {
    initGeetest4?: InitGeetest4
  }
}

/** 用户主动关闭验证弹窗的错误码（调用方可静默处理） */
export const GEETEST_CANCELLED = 'GEETEST_CANCELLED'

function captchaId(): string {
  return (import.meta.env.VITE_GEETEST_CAPTCHA_ID as string | undefined) || ''
}

/** 弹出极验验证；成功 resolve 校验参数，取消/失败 reject */
export function showGeetest(): Promise<GeetestParams> {
  return new Promise((resolve, reject) => {
    const id = captchaId()
    if (!id || typeof window.initGeetest4 !== 'function') {
      // 开发环境未配置：直接放行，由后端提示缺失验证
      resolve({} as GeetestParams)
      return
    }
    window.initGeetest4({ captchaId: id, product: 'bind', language: 'zh-cn' }, (captcha) => {
      captcha.onSuccess(() => {
        const result = captcha.getValidate()
        if (result) {
          resolve(result)
        } else {
          reject(new Error('人机验证未完成，请重试'))
        }
      })
      captcha.onError(() => {
        reject(new Error('人机验证加载失败，请重试'))
      })
      captcha.onClose?.(() => {
        reject(Object.assign(new Error('已取消人机验证'), { code: GEETEST_CANCELLED }))
      })
      captcha.showCaptcha()
    })
  })
}
