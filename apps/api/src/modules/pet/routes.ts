import {
  createPetSchema,
  type CreatePetInput,
  type UpdatePetInput,
  updatePetSchema,
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

const petRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

petRoutes.get('/', async (c) => {
  const list = await c.get('deps').petService.list(c.get('userId'));
  return c.json(list);
});

petRoutes.get('/:id', async (c) => {
  const dto = await c.get('deps').petService.get(c.req.param('id'), c.get('userId'));
  return c.json(dto);
});

petRoutes.post('/', zValidator('json', createPetSchema), async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const body = c.req.valid('json') as CreatePetInput;
  const created = await c.get('deps').petService.create(userId, body);
  return c.json(created, 201);
});

petRoutes.patch('/:id', zValidator('json', updatePetSchema), async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  const body = c.req.valid('json') as UpdatePetInput;
  const updated = await c.get('deps').petService.update(userId, c.req.param('id'), body);
  return c.json(updated);
});

petRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw err.unauthorized();
  await c.get('deps').petService.remove(userId, c.req.param('id'));
  return c.body(null, 204);
});

export { petRoutes };

export function mountPetRoutes(app: Hono<{ Bindings: Env; Variables: Vars }>) {
  app.route('/pets', petRoutes);
}