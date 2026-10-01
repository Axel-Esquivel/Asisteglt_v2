import { ModuleType, ProjectRole } from '@asisteglt/shared-contracts';
import { Schema } from 'mongoose';
import { MemberSnapshot, ProjectSnapshot, ProjectStatus } from '../../domain/project';
import { ShareLinkSnapshot } from '../../domain/share-link';

export type ProjectRecord = Omit<ProjectSnapshot, 'id'> & { readonly _id: string };
export type ShareLinkRecord = Omit<ShareLinkSnapshot, 'id'> & { readonly _id: string };

const MEMBER_SCHEMA: Schema<MemberSnapshot> = new Schema<MemberSnapshot>(
  {
    userId: { type: String, required: true },
    role: { type: String, enum: Object.values(ProjectRole), required: true },
    joinedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const PROJECT_SCHEMA: Schema<ProjectRecord> = new Schema<ProjectRecord>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    moduleType: { type: String, enum: Object.values(ModuleType), required: true },
    ownerId: { type: String, required: true },
    status: { type: String, enum: Object.values(ProjectStatus), required: true },
    members: { type: [MEMBER_SCHEMA], required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'projects', versionKey: false },
);
PROJECT_SCHEMA.index({ 'members.userId': 1 });

export const SHARE_LINK_SCHEMA: Schema<ShareLinkRecord> = new Schema<ShareLinkRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: Object.values(ProjectRole), required: true },
    expiresAt: { type: Date, default: null },
    maxUses: { type: Number, default: null },
    uses: { type: Number, required: true },
    revokedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'share_links', versionKey: false },
);
