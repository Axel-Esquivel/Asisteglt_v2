import { OrgLevel, ProfileStatus, SourceType } from '@asisteglt/shared-contracts';
import { Schema } from 'mongoose';
import { ProfileSnapshot } from '../../domain/data-source-profile';
import { FieldCatalogSnapshot } from '../../domain/field-catalog';
import { ImportBatchSnapshot } from '../../domain/import-batch';
import { OrgStructureSnapshot } from '../../domain/org-structure';
import { DataRecordSnapshot } from '../../domain/ports';

export type OrgStructureRecord = Omit<OrgStructureSnapshot, 'id'> & { readonly _id: string };
export type FieldCatalogRecord = Omit<FieldCatalogSnapshot, 'id'> & { readonly _id: string };
export type ProfileRecord = Omit<ProfileSnapshot, 'id'> & { readonly _id: string };
export type ImportBatchRecord = Omit<ImportBatchSnapshot, 'id'> & { readonly _id: string };
export type DataRecordDocument = Omit<DataRecordSnapshot, 'id'> & { readonly _id: string };

export const ORG_STRUCTURE_SCHEMA: Schema<OrgStructureRecord> = new Schema<OrgStructureRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, unique: true },
    units: [
      {
        _id: false,
        id: { type: String, required: true },
        level: { type: String, enum: Object.values(OrgLevel), required: true },
        parentId: { type: String, default: null },
        code: { type: String, required: true },
        name: { type: String, required: true },
        currencies: { type: [String], default: [] },
      },
    ],
  },
  { collection: 'org_structures', versionKey: false },
);

export const FIELD_CATALOG_SCHEMA: Schema<FieldCatalogRecord> = new Schema<FieldCatalogRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, unique: true },
    version: { type: Number, required: true },
    fields: { type: Schema.Types.Mixed, required: true },
  },
  { collection: 'field_catalogs', versionKey: false },
);

export const PROFILE_SCHEMA: Schema<ProfileRecord> = new Schema<ProfileRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    sourceType: { type: String, enum: Object.values(SourceType), required: true },
    extensions: { type: [String], required: true },
    fileNamePattern: { type: String, default: null },
    status: { type: String, enum: Object.values(ProfileStatus), required: true },
    version: { type: Number, required: true },
    spec: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'data_source_profiles', versionKey: false, minimize: false },
);

export const IMPORT_BATCH_SCHEMA: Schema<ImportBatchRecord> = new Schema<ImportBatchRecord>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    items: { type: Schema.Types.Mixed, required: true },
  },
  { collection: 'import_batches', versionKey: false, minimize: false },
);
IMPORT_BATCH_SCHEMA.index({ projectId: 1, createdAt: -1 });
IMPORT_BATCH_SCHEMA.index({ 'items.status': 1 });

export const DATA_RECORD_SCHEMA: Schema<DataRecordDocument> = new Schema<DataRecordDocument>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true },
    loadId: { type: String, required: true, index: true },
    profileId: { type: String, required: true },
    period: { type: String, required: true },
    organizationId: { type: String, required: true },
    countryId: { type: String, required: true },
    currency: { type: String, required: true },
    companyId: { type: String, required: true },
    enterpriseId: { type: String, default: null },
    branchId: { type: String, default: null },
    line: { type: Number, required: true },
    values: { type: Schema.Types.Mixed, required: true },
  },
  { collection: 'data_records', versionKey: false, minimize: false },
);
DATA_RECORD_SCHEMA.index({ projectId: 1, period: 1, profileId: 1, companyId: 1 });
