import {
  CatalogFieldResponse,
  DataRecordResponse,
  FieldCatalogResponse,
  OrgStructureResponse,
  OrgUnitResponse,
  ProfileResponse,
} from '@asisteglt/shared-contracts';
import { DataSourceProfile } from '../domain/data-source-profile';
import { CatalogField, FieldCatalog } from '../domain/field-catalog';
import { OrgStructure, OrgUnitSnapshot } from '../domain/org-structure';
import { DataRecordSnapshot } from '../domain/ports';

export class ReportsPresenter {
  public static orgUnit(unit: OrgUnitSnapshot): OrgUnitResponse {
    return { ...unit, currencies: [...unit.currencies] };
  }

  public static org(structure: OrgStructure): OrgStructureResponse {
    return { units: structure.all().map(ReportsPresenter.orgUnit) };
  }

  public static field(field: CatalogField): CatalogFieldResponse {
    return { ...field.snapshot() };
  }

  public static catalog(catalog: FieldCatalog): FieldCatalogResponse {
    return { version: catalog.getVersion(), fields: catalog.all().map(ReportsPresenter.field) };
  }

  public static profile(profile: DataSourceProfile): ProfileResponse {
    const s = profile.toSnapshot();
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      sourceType: s.sourceType,
      extensions: s.extensions,
      fileNamePattern: s.fileNamePattern,
      status: s.status,
      version: s.version,
      spec: s.spec,
      checks: s.checks,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  public static record(record: DataRecordSnapshot): DataRecordResponse {
    return {
      id: record.id,
      line: record.line,
      loadId: record.loadId,
      period: record.period,
      companyId: record.companyId,
      currency: record.currency,
      values: record.values,
    };
  }
}
