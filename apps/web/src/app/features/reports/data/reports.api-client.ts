import { Injectable } from '@angular/core';
import {
  BalanceChecksRequest,
  CatalogFieldRequest,
  CollectionRequest,
  ClassificationRequest,
  CatalogTemplate,
  CreateOrgUnitRequest,
  ImportManifest,
  OperationsRequest,
  ProfileRequest,
  ReportDefinitionRequest,
  UpdateOrgUnitRequest,
} from '@asisteglt/shared-contracts';
import { ArrayDecoder, EmptyDecoder, FieldDecoder, Nullable, Result } from '@asisteglt/shared-kernel';
import { ApiClient } from '@asisteglt/web-core';
import { ClassificationView, ComputedReport, ReportDefinitionView } from './analysis.model';
import { CatalogFieldView, CatalogView } from './catalog.model';
import { CollectionView } from './collections.model';
import { RecordPage, ImportBatchView } from './import.model';
import { OperationsView } from './operations.model';
import { OrgTree, OrgUnitView } from './org.model';
import { ProfileView } from './profile.model';

export interface RecordFilters {
  readonly period: Nullable<string>;
  readonly profileId: Nullable<string>;
  readonly companyId: Nullable<string>;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiClient extends ApiClient {
  private readonly org: FieldDecoder<OrgTree> = OrgTree.decoder();
  private readonly unit: FieldDecoder<OrgUnitView> = OrgUnitView.decoder();
  private readonly catalog: FieldDecoder<CatalogView> = CatalogView.decoder();
  private readonly field: FieldDecoder<CatalogFieldView> = CatalogFieldView.decoder();
  private readonly profile: FieldDecoder<ProfileView> = ProfileView.decoder();
  private readonly profiles: ArrayDecoder<ProfileView> = new ArrayDecoder<ProfileView>(ProfileView.decoder());
  private readonly batch: FieldDecoder<ImportBatchView> = ImportBatchView.decoder();
  private readonly batches: ArrayDecoder<ImportBatchView> = new ArrayDecoder<ImportBatchView>(
    ImportBatchView.decoder(),
  );
  private readonly page: FieldDecoder<RecordPage> = RecordPage.decoder();
  private readonly empty: EmptyDecoder = new EmptyDecoder();
  private readonly classificationDecoder: FieldDecoder<ClassificationView> = ClassificationView.decoder();
  private readonly classificationsDecoder: ArrayDecoder<ClassificationView> =
    new ArrayDecoder<ClassificationView>(ClassificationView.decoder());
  private readonly reportDecoder: FieldDecoder<ReportDefinitionView> = ReportDefinitionView.decoder();
  private readonly reportsDecoder: ArrayDecoder<ReportDefinitionView> =
    new ArrayDecoder<ReportDefinitionView>(ReportDefinitionView.decoder());
  private readonly collectionDecoder: FieldDecoder<CollectionView> = CollectionView.decoder();
  private readonly collectionsDecoder: ArrayDecoder<CollectionView> = new ArrayDecoder<CollectionView>(
    CollectionView.decoder(),
  );
  private readonly operationsDecoder: FieldDecoder<OperationsView> = OperationsView.decoder();
  private readonly computedDecoder: FieldDecoder<ComputedReport> = ComputedReport.decoder();

  public orgStructure(projectId: string): Promise<Result<OrgTree>> {
    return this.get(`${ReportsApiClient.base(projectId)}/org-structure`, this.org);
  }

  public addUnit(projectId: string, request: CreateOrgUnitRequest): Promise<Result<OrgUnitView>> {
    return this.post(`${ReportsApiClient.base(projectId)}/org-structure/units`, request, this.unit);
  }

  public changeUnit(
    projectId: string,
    unitId: string,
    request: UpdateOrgUnitRequest,
  ): Promise<Result<OrgUnitView>> {
    return this.put(
      `${ReportsApiClient.base(projectId)}/org-structure/units/${encodeURIComponent(unitId)}`,
      request,
      this.unit,
    );
  }

  public removeUnit(projectId: string, unitId: string): Promise<Result<true>> {
    return this.delete(
      `${ReportsApiClient.base(projectId)}/org-structure/units/${encodeURIComponent(unitId)}`,
      this.empty,
    );
  }

  public fieldCatalog(projectId: string): Promise<Result<CatalogView>> {
    return this.get(`${ReportsApiClient.base(projectId)}/catalog`, this.catalog);
  }

  public addField(projectId: string, request: CatalogFieldRequest): Promise<Result<CatalogFieldView>> {
    return this.post(`${ReportsApiClient.base(projectId)}/catalog/fields`, request, this.field);
  }

  public redefineField(
    projectId: string,
    key: string,
    request: CatalogFieldRequest,
  ): Promise<Result<CatalogFieldView>> {
    return this.put(
      `${ReportsApiClient.base(projectId)}/catalog/fields/${encodeURIComponent(key)}`,
      request,
      this.field,
    );
  }

  public renameField(projectId: string, key: string, label: string): Promise<Result<CatalogFieldView>> {
    return this.patch(
      `${ReportsApiClient.base(projectId)}/catalog/fields/${encodeURIComponent(key)}/label`,
      { label },
      this.field,
    );
  }

  public deactivateField(projectId: string, key: string, force: boolean): Promise<Result<CatalogFieldView>> {
    return this.post(
      `${ReportsApiClient.base(projectId)}/catalog/fields/${encodeURIComponent(key)}/deactivate?force=${String(force)}`,
      null,
      this.field,
    );
  }

  public applyTemplate(projectId: string, template: CatalogTemplate): Promise<Result<CatalogView>> {
    return this.post(`${ReportsApiClient.base(projectId)}/catalog/templates`, { template }, this.catalog);
  }

  public profileList(projectId: string): Promise<Result<ProfileView[]>> {
    return this.get(`${ReportsApiClient.base(projectId)}/profiles`, this.profiles);
  }

  public findProfile(projectId: string, profileId: string): Promise<Result<ProfileView>> {
    return this.get(
      `${ReportsApiClient.base(projectId)}/profiles/${encodeURIComponent(profileId)}`,
      this.profile,
    );
  }

  public createProfile(projectId: string, request: ProfileRequest): Promise<Result<ProfileView>> {
    return this.post(`${ReportsApiClient.base(projectId)}/profiles`, request, this.profile);
  }

  public updateProfile(
    projectId: string,
    profileId: string,
    request: ProfileRequest,
  ): Promise<Result<ProfileView>> {
    return this.put(
      `${ReportsApiClient.base(projectId)}/profiles/${encodeURIComponent(profileId)}`,
      request,
      this.profile,
    );
  }

  public profileAction(
    projectId: string,
    profileId: string,
    action: 'activate' | 'archive',
  ): Promise<Result<ProfileView>> {
    return this.post(
      `${ReportsApiClient.base(projectId)}/profiles/${encodeURIComponent(profileId)}/${action}`,
      null,
      this.profile,
    );
  }

  public duplicateProfile(projectId: string, profileId: string, name: string): Promise<Result<ProfileView>> {
    return this.post(
      `${ReportsApiClient.base(projectId)}/profiles/${encodeURIComponent(profileId)}/duplicate`,
      { name },
      this.profile,
    );
  }

  public submitImport(
    projectId: string,
    manifest: ImportManifest,
    files: ReadonlyArray<File>,
  ): Promise<Result<ImportBatchView>> {
    const form: FormData = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    files.forEach((file: File): void => form.append('files', file, file.name));
    return this.upload(`${ReportsApiClient.base(projectId)}/imports`, form, this.batch);
  }

  public importHistory(projectId: string): Promise<Result<ImportBatchView[]>> {
    return this.get(`${ReportsApiClient.base(projectId)}/imports`, this.batches);
  }

  public records(
    projectId: string,
    filters: RecordFilters,
    page: number,
    size: number,
  ): Promise<Result<RecordPage>> {
    const query: URLSearchParams = new URLSearchParams({ page: String(page), size: String(size) });
    if (filters.period !== null) {
      query.set('period', filters.period);
    }
    if (filters.profileId !== null) {
      query.set('profileId', filters.profileId);
    }
    if (filters.companyId !== null) {
      query.set('companyId', filters.companyId);
    }
    return this.get(`${ReportsApiClient.base(projectId)}/records?${query.toString()}`, this.page);
  }

  public classificationList(projectId: string): Promise<Result<ClassificationView[]>> {
    return this.get(`${ReportsApiClient.base(projectId)}/classifications`, this.classificationsDecoder);
  }

  public saveClassification(
    projectId: string,
    id: Nullable<string>,
    request: ClassificationRequest,
  ): Promise<Result<ClassificationView>> {
    const path: string = `${ReportsApiClient.base(projectId)}/classifications`;
    return id === null
      ? this.post(path, request, this.classificationDecoder)
      : this.put(`${path}/${encodeURIComponent(id)}`, request, this.classificationDecoder);
  }

  public deleteClassification(projectId: string, id: string): Promise<Result<true>> {
    return this.delete(
      `${ReportsApiClient.base(projectId)}/classifications/${encodeURIComponent(id)}`,
      this.empty,
    );
  }

  public reportList(projectId: string): Promise<Result<ReportDefinitionView[]>> {
    return this.get(`${ReportsApiClient.base(projectId)}/report-definitions`, this.reportsDecoder);
  }

  public saveReport(
    projectId: string,
    id: Nullable<string>,
    request: ReportDefinitionRequest,
  ): Promise<Result<ReportDefinitionView>> {
    const path: string = `${ReportsApiClient.base(projectId)}/report-definitions`;
    return id === null
      ? this.post(path, request, this.reportDecoder)
      : this.put(`${path}/${encodeURIComponent(id)}`, request, this.reportDecoder);
  }

  public deleteReport(projectId: string, id: string): Promise<Result<true>> {
    return this.delete(
      `${ReportsApiClient.base(projectId)}/report-definitions/${encodeURIComponent(id)}`,
      this.empty,
    );
  }

  public runReport(projectId: string, id: string, period: string): Promise<Result<ComputedReport>> {
    return this.get(
      `${ReportsApiClient.base(projectId)}/report-definitions/${encodeURIComponent(id)}/run?period=${encodeURIComponent(period)}`,
      this.computedDecoder,
    );
  }

  public operations(projectId: string): Promise<Result<OperationsView>> {
    return this.get(`${ReportsApiClient.base(projectId)}/operations`, this.operationsDecoder);
  }

  public saveOperations(projectId: string, request: OperationsRequest): Promise<Result<OperationsView>> {
    return this.put(`${ReportsApiClient.base(projectId)}/operations`, request, this.operationsDecoder);
  }

  public saveChecks(
    projectId: string,
    profileId: string,
    request: BalanceChecksRequest,
  ): Promise<Result<ProfileView>> {
    return this.put(
      `${ReportsApiClient.base(projectId)}/profiles/${encodeURIComponent(profileId)}/checks`,
      request,
      this.profile,
    );
  }

  public collections(projectId: string): Promise<Result<CollectionView[]>> {
    return this.get(`${ReportsApiClient.base(projectId)}/collections`, this.collectionsDecoder);
  }

  public saveCollection(
    projectId: string,
    id: Nullable<string>,
    request: CollectionRequest,
  ): Promise<Result<CollectionView>> {
    const path: string = `${ReportsApiClient.base(projectId)}/collections`;
    return id === null
      ? this.post(path, request, this.collectionDecoder)
      : this.put(`${path}/${encodeURIComponent(id)}`, request, this.collectionDecoder);
  }

  public deleteCollection(projectId: string, id: string): Promise<Result<true>> {
    return this.delete(
      `${ReportsApiClient.base(projectId)}/collections/${encodeURIComponent(id)}`,
      this.empty,
    );
  }

  private static base(projectId: string): string {
    return `projects/${encodeURIComponent(projectId)}`;
  }
}
