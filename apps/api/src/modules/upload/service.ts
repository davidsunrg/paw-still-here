import type { CompleteUploadResult, PresignUploadInput, PresignUploadResult } from '@paw/shared';
import type { Env } from '../../env';
import { err } from '../../lib/errors';
import type { createR2Presigner } from '../../lib/r2-presign';
import type { UploadRepository } from './repository';

type Presigner = ReturnType<typeof createR2Presigner>;

export function createUploadService(
  uploadRepo: UploadRepository,
  presigner: Presigner,
  env: Env,
) {
  return {
    async presign(ownerId: string, input: PresignUploadInput): Promise<PresignUploadResult> {
      const id = crypto.randomUUID();
      const key = `users/${ownerId}/${id}`;
      const publicUrl = `${env.PUBLIC_ASSETS_URL.replace(/\/$/, '')}/${key}`;
      const now = new Date();
      await uploadRepo.createPending({
        id,
        ownerId,
        r2Key: key,
        publicUrl,
        originalName: input.originalName,
        contentType: input.contentType,
        status: 'pending',
        createdAt: now,
        completedAt: null,
      });
      const putUrl = await presigner.signPut(key, input.contentType);
      return { uploadId: id, putUrl, publicUrl };
    },

    async complete(
      ownerId: string,
      uploadId: string,
      bucket: R2Bucket,
    ): Promise<CompleteUploadResult> {
      const row = await uploadRepo.getById(uploadId);
      if (!row) throw err.notFound('upload_not_found');
      if (row.ownerId !== ownerId) throw err.forbidden();
      if (row.status === 'completed') {
        return { uploadId, publicUrl: row.publicUrl, status: 'completed' };
      }
      const head = await bucket.head(row.r2Key);
      if (!head) throw err.badRequest('object_missing');
      const now = new Date();
      await uploadRepo.markCompleted(uploadId, now);
      return { uploadId, publicUrl: row.publicUrl, status: 'completed' };
    },
  };
}