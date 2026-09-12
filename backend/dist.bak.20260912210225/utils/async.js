// 把 async 路由 handler 的错误转交给 Express 错误处理中间件
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
//# sourceMappingURL=async.js.map