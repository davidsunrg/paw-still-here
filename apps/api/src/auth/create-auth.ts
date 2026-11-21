import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import type { Db } from '../db';
import * as schema from '../db/schema';
import type { Env } from '../env';

export function createAuth(db: Db, env: Env) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [env.BETTER_AUTH_URL.replace(/\/$/, ''), 'http://localhost:5173'],
    plugins: [anonymous()],
  });
}

export type Auth = ReturnType<typeof createAuth>;