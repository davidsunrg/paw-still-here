import { presignUploadSchema, type PresignUploadInput } from '@paw/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { err } from '../../lib/errors';
import type { RequestDeps } from '../../lib/deps';

type Vars = {
  deps: RequestDeps;
  userId: string | null;
};

const uploadRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

uploadRoutes.post('/presign', zValidator('json', presignUploadSchema), async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const body = c.req.valid('json') as PresignUploadInput;
  const result = await c.get('deps').uploadService.presign(userId, body);
  return c.json(result);
});

uploadRoutes.post('/:id/complete', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const result = await c.get('deps').uploadService.complete(
    userId,
    c.req.param('id'),
    c.env.BUCKET,
  );
  return c.json(result);
});

export { uploadRoutes };

export function mountUploadRoutes(app: Hono<{ Bindings: Env; Variables: Vars }>) {
  app.route('/uploads', uploadRoutes);
}