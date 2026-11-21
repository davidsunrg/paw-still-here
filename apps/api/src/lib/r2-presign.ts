import { AwsClient } from 'aws4fetch';
import type { Env } from '../env';
import { err } from './errors';

export function createR2Presigner(env: Env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return {
      async signPut(_key: string, _contentType: string): Promise<string> {
        throw err.badRequest('r2_not_configured');
      },
    };
  }

  const client = new AwsClient({ accessKeyId, secretAccessKey });
  return {
    async signPut(key: string, contentType: string, expiresSec = 600): Promise<string> {
      const url = new URL(
        `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeR2Key(key)}`,
      );
      url.searchParams.set('X-Amz-Expires', String(expiresSec));
      const signed = await client.sign(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}

function encodeR2Key(key: string): string {
  return key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}