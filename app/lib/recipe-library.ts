export const RECIPE_PAGE_SIZE = 10;

export interface PaginationModel {
  currentPage: number;
  totalPages: number;
  pages: number[];
  rangeStart: number;
  rangeEnd: number;
}

export function getPaginationModel(totalItems: number, pageSize = RECIPE_PAGE_SIZE, requestedPage = 1): PaginationModel {
  const safeTotal = Math.max(0, Math.floor(totalItems));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const rangeStart = safeTotal ? (currentPage - 1) * safePageSize + 1 : 0;
  const rangeEnd = safeTotal ? Math.min(currentPage * safePageSize, safeTotal) : 0;
  return { currentPage, totalPages, pages, rangeStart, rangeEnd };
}

export function paginateItems<T>(items: T[], requestedPage: number, pageSize = RECIPE_PAGE_SIZE): T[] {
  const pagination = getPaginationModel(items.length, pageSize, requestedPage);
  const offset = (pagination.currentPage - 1) * Math.max(1, Math.floor(pageSize));
  return items.slice(offset, offset + Math.max(1, Math.floor(pageSize)));
}
