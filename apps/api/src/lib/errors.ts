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

export const err = {
  unauthorized: () => new DomainError('unauthorized', 401),
  forbidden: () => new DomainError('forbidden', 403),
  notFound: (what = 'not_found') => new DomainError(what, 404),
  galleryFull: () => new DomainError('gallery_full', 409),
  badRequest: (code: string) => new DomainError(code, 400),
  conflict: (code: string) => new DomainError(code, 409),
} as const;