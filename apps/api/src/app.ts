import type { Health } from '@paw/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono()
  .basePath('/api')
  .use('*', logger())
  .get('/health', (c) => c.json<Health>({ ok: true, time: Date.now() }))
  .notFound((c) => c.json({ error: 'not_found' }, 404))
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal_error' }, 500);
  });

export type AppType = typeof app;
export default app;