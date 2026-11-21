export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 500;

export class DomainError extends Error {
  readonly status: HttpStatus;

  constructor(
    public readonly code: string,
    status: Exclude<HttpStatus, 500>,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DomainError';
    this.status = status;
  }
}

/**
 * 错误和它一层层的 cause 里，有没有哪一条消息对得上。
 * drizzle 会把 D1 的报错包一层（"Failed query: …"），唯一索引冲突的原话在 cause 里。
 */
export function errorChainMatches(error: unknown, pattern: RegExp): boolean {
  for (let e = error, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (pattern.test(e.message)) return true;
  }
  return false;
}

export const err = {
  unauthorized: () => new DomainError('unauthorized', 401),
  forbidden: () => new DomainError('forbidden', 403),
  notFound: (what = 'not_found') => new DomainError(what, 404),
  galleryFull: () => new DomainError('gallery_full', 409),
  badRequest: (code: string) => new DomainError(code, 400),
  conflict: (code: string) => new DomainError(code, 409),
} as const;