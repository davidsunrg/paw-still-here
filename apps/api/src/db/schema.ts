import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey().notNull(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

export const pet = sqliteTable(
  'pet',
  {
    id: text('id').primaryKey().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    name: text('name').notNull(),
    species: text('species').notNull(),
    breed: text('breed'),
    birthDate: text('birth_date'),
    passedDate: text('passed_date').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    slotUnique: uniqueIndex('pet_slot_unique').on(t.slot),
    ownerIdx: index('pet_owner_idx').on(t.ownerId),
  }),
);

export const upload = sqliteTable(
  'upload',
  {
    id: text('id').primaryKey().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    publicUrl: text('public_url').notNull(),
    originalName: text('original_name').notNull(),
    contentType: text('content_type').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    keyUnique: uniqueIndex('upload_r2_key_unique').on(t.r2Key),
    ownerIdx: index('upload_owner_idx').on(t.ownerId),
  }),
);

export const petPhoto = sqliteTable(
  'pet_photo',
  {
    id: text('id').primaryKey().notNull(),
    petId: text('pet_id')
      .notNull()
      .references(() => pet.id, { onDelete: 'cascade' }),
    uploadId: text('upload_id')
      .notNull()
      .references(() => upload.id),
    role: text('role').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    uploadUnique: uniqueIndex('pet_photo_upload_unique').on(t.uploadId),
    petPosition: uniqueIndex('pet_photo_position').on(t.petId, t.position),
  }),
);