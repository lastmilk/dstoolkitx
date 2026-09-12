/**
 * 分页参数解析：传 page 时启用分页（返回 total），未传则保持旧的全量返回。
 * pageSize 上限 500，防止恶意拉取超大页。
 */
export function parsePaging(req) {
    const page = req.query.page != null ? Number(req.query.page) : NaN;
    const pageSize = req.query.pageSize != null ? Number(req.query.pageSize) : NaN;
    const paged = Number.isFinite(page) && page > 0;
    return {
        page: paged ? page : 1,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
        paged,
    };
}
/** 构造统一的分页响应体 { records, total, page, pageSize } */
export function pageResponse(records, meta) {
    return { records, total: meta.total, page: meta.page, pageSize: meta.pageSize };
}
//# sourceMappingURL=paging.js.map