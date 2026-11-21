import type { Health } from '@paw/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './env';
import { DomainError } from './lib/errors';
import { createRequestDeps, type RequestDeps } from './lib/deps';
import { mountPetRoutes } from './modules/pet/routes';
import { mountUploadRoutes } from './modules/upload/routes';

type Vars = {
  deps: RequestDeps;
  userId: string | null;
};

const app = new Hono<{ Bindings: Env; Variables: Vars }>()
  .basePath('/api')
  .use('*', logger())
  .use(
    '*',
    cors({
      origin: (origin) => origin ?? '*',
      credentials: true,
    }),
  )
  .use('*', async (c, next) => {
    const deps = createRequestDeps(c.env);
    c.set('deps', deps);
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    c.set('userId', session?.user?.id ?? null);
    await next();
  })
  .get('/health', (c) => c.json<Health>({ ok: true, time: Date.now() }))
  .on(['POST', 'GET'], '/auth/*', (c) => c.get('deps').auth.handler(c.req.raw));

mountPetRoutes(app);
mountUploadRoutes(app);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  if (err instanceof DomainError) {
    return c.json({ error: err.code }, err.status);
  }
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof app;
export default app;