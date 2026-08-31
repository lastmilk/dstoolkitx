import type { Request, Response, NextFunction } from 'express'

// 把 async 路由 handler 的错误转交给 Express 错误处理中间件
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
