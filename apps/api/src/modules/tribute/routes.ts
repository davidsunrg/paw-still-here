import {
  createLetterSchema,
  createTributeSchema,
  type CreateLetterInput,
  type CreateTributeInput,
} from '@paw/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { err } from '../../lib/errors';
import type { RequestDeps } from '../../lib/deps';

type Vars = {
  deps: RequestDeps;
  userId: string | null;
};

const tributeRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

/** 公开读取；带 since（毫秒时间戳）时多返回那之后别人留下的数量 */
tributeRoutes.get('/:id/tributes', async (c) => {
  const raw = c.req.query('since');
  const since = raw === undefined ? NaN : Number(raw);
  const dto = await c
    .get('deps')
    .tributeService.summary(c.req.param('id'), c.get('userId'), Number.isFinite(since) && since >= 0 ? since : undefined);
  return c.json(dto);
});

tributeRoutes.post('/:id/tributes', zValidator('json', createTributeSchema), async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const body = c.req.valid('json') as CreateTributeInput;
  const created = await c.get('deps').tributeService.give(userId, c.req.param('id'), body.kind);
  return c.json(created, 201);
});

tributeRoutes.post('/:id/letters', zValidator('json', createLetterSchema), async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const body = c.req.valid('json') as CreateLetterInput;
  const created = await c.get('deps').tributeService.writeLetter(userId, c.req.param('id'), body.text);
  return c.json(created, 201);
});

tributeRoutes.delete('/:id/letters/:letterId', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  await c.get('deps').tributeService.removeLetter(userId, c.req.param('id'), c.req.param('letterId'));
  return c.body(null, 204);
});

export { tributeRoutes };

export function mountTributeRoutes(app: Hono<{ Bindings: Env; Variables: Vars }>) {
  app.route('/pets', tributeRoutes);
}
