import type { PetDto } from '@paw/shared';
import { applyGalleryFromApi, applyOfflineGallery } from '../data/pets-api';
import { apiFetch } from './client';

export type AppBootstrap = {
  apiOnline: boolean;
  currentUserId: string | null;
};

async function ensureAnonymousSession(): Promise<void> {
  const session = await apiFetch<{ user?: { id: string }; session?: { token: string } } | null>(
    '/api/auth/get-session',
    { method: 'GET' },
  );
  if (session?.session) return;
  await apiFetch('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
}

export async function prepareApp(): Promise<AppBootstrap> {
  try {
    await apiFetch('/api/health');
  } catch {
    applyOfflineGallery();
    return { apiOnline: false, currentUserId: null };
  }

  // 匿名登录失败不应拖垮公开照片墙；只是没有创建和管理权限
  let currentUserId: string | null = null;
  try {
    await ensureAnonymousSession();
    const session = await apiFetch<{ user?: { id: string } } | null>('/api/auth/get-session');
    currentUserId = session?.user?.id ?? null;
  } catch {
    currentUserId = null;
  }

  try {
    const pets = await apiFetch<PetDto[]>('/api/pets');
    applyGalleryFromApi(pets);
    return { apiOnline: true, currentUserId };
  } catch {
    applyOfflineGallery();
    return { apiOnline: false, currentUserId };
  }
}
