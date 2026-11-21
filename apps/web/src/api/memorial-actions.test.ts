import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadMemorialImage } from './memorial-actions';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('R2 browser upload', () => {
  it('presigns, PUTs the file, then completes the same upload ID', async () => {
    const uploadId = crypto.randomUUID();
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/uploads/presign') {
        return new Response(JSON.stringify({ uploadId, putUrl: 'https://r2.test/put', publicUrl: 'https://cdn.test/file' }), { status: 200 });
      }
      if (url === 'https://r2.test/put') return new Response(null, { status: 200 });
      if (url === `/api/uploads/${uploadId}/complete`) {
        return new Response(JSON.stringify({ uploadId, publicUrl: 'https://cdn.test/file', status: 'completed' }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const file = new File(['image'], 'pet.png', { type: 'image/png' });
    const result = await uploadMemorialImage(file);
    expect(result.uploadId).toBe(uploadId);
    expect(calls).toEqual(['/api/uploads/presign', 'https://r2.test/put', `/api/uploads/${uploadId}/complete`]);
    const put = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === 'https://r2.test/put');
    expect(put?.[1]?.method).toBe('PUT');
    expect(put?.[1]?.body).toBe(file);
  });

  it('does not call complete when the direct PUT fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/uploads/presign') {
        return new Response(JSON.stringify({ uploadId: crypto.randomUUID(), putUrl: 'https://r2.test/put', publicUrl: 'https://cdn.test/file' }), { status: 200 });
      }
      return new Response(null, { status: 503 });
    }) as typeof fetch;
    await expect(uploadMemorialImage(new File(['x'], 'pet.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'upload_failed' });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes('/complete'))).toBe(false);
  });
});
