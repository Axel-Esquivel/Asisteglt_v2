import { Schema } from 'mongoose';
import { SessionSnapshot } from '../../domain/session';
import { UserStatus, UserSnapshot } from '../../domain/user';

/** Documento MongoDB = instantánea del agregado con `_id` = id del dominio. */
export type UserRecord = Omit<UserSnapshot, 'id'> & { readonly _id: string };
export type SessionRecord = Omit<SessionSnapshot, 'id'> & { readonly _id: string };

export const USER_SCHEMA: Schema<UserRecord> = new Schema<UserRecord>(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    status: { type: String, enum: Object.values(UserStatus), required: true },
    failedLoginAttempts: { type: Number, required: true },
    lockoutCount: { type: Number, required: true },
    lockedUntil: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { collection: 'users', versionKey: false },
);

export const SESSION_SCHEMA: Schema<SessionRecord> = new Schema<SessionRecord>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    previousTokenHashes: { type: [String], required: true, index: true },
    userAgent: { type: String, required: true },
    ipAddress: { type: String, required: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: 'sessions', versionKey: false },
);
