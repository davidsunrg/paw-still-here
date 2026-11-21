import { createAuth } from '../auth/create-auth';
import { createDb } from '../db';
import type { Env } from '../env';
import { createPetRepository } from '../modules/pet/repository';
import { createPetService } from '../modules/pet/service';
import { createTributeRepository } from '../modules/tribute/repository';
import { createTributeService } from '../modules/tribute/service';
import { createUploadRepository } from '../modules/upload/repository';
import { createUploadService } from '../modules/upload/service';
import { createR2Presigner } from './r2-presign';

export function createRequestDeps(env: Env) {
  const db = createDb(env.DB);
  const auth = createAuth(db, env);
  const petRepo = createPetRepository(db);
  const uploadRepo = createUploadRepository(db);
  const presigner = createR2Presigner(env);
  const uploadService = createUploadService(uploadRepo, presigner, env);
  const tributeRepo = createTributeRepository(db);
  const petService = createPetService(petRepo, uploadRepo, tributeRepo);
  const tributeService = createTributeService(tributeRepo, petRepo);

  return {
    db,
    auth,
    petRepo,
    uploadRepo,
    uploadService,
    petService,
    tributeService,
    env,
  };
}

export type RequestDeps = ReturnType<typeof createRequestDeps>;