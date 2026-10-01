import { ConversationType } from '@asisteglt/shared-contracts';
import { Schema } from 'mongoose';
import { ConversationSnapshot } from '../../domain/conversation';
import { MessageSnapshot } from '../../domain/message';
import { ReadMarkerSnapshot } from '../../domain/read-marker';

export type ConversationRecord = Omit<ConversationSnapshot, 'id'> & { readonly _id: string };
export type MessageRecord = Omit<MessageSnapshot, 'id'> & { readonly _id: string };
export type ReadMarkerRecord = Omit<ReadMarkerSnapshot, 'id'> & { readonly _id: string };

export const CONVERSATION_SCHEMA: Schema<ConversationRecord> = new Schema<ConversationRecord>(
  {
    _id: { type: String, required: true },
    type: { type: String, enum: Object.values(ConversationType), required: true, index: true },
    pairKey: { type: String, default: null, index: true },
    participantIds: { type: [String], required: true, index: true },
    projectId: { type: String, default: null, index: true },
    createdAt: { type: Date, required: true },
    lastMessageAt: { type: Date, default: null },
  },
  { collection: 'conversations', versionKey: false },
);

export const MESSAGE_SCHEMA: Schema<MessageRecord> = new Schema<MessageRecord>(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    text: { type: String, default: '' },
    sentAt: { type: Date, required: true },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'messages', versionKey: false },
);
MESSAGE_SCHEMA.index({ conversationId: 1, sentAt: -1 });

export const READ_MARKER_SCHEMA: Schema<ReadMarkerRecord> = new Schema<ReadMarkerRecord>(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true },
    userId: { type: String, required: true },
    readAt: { type: Date, required: true },
  },
  { collection: 'read_markers', versionKey: false },
);
