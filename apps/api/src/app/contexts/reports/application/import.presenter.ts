import { ImportBatchResponse, ImportItemResponse } from '@asisteglt/shared-contracts';
import { ImportBatch, ImportIssue, ImportItemSnapshot } from '../domain/import-batch';

export class ImportPresenter {
  public static batch(batch: ImportBatch): ImportBatchResponse {
    const s = batch.toSnapshot();
    return {
      id: s.id,
      createdBy: s.createdBy,
      createdAt: s.createdAt.toISOString(),
      items: s.items.map((item: ImportItemSnapshot): ImportItemResponse => ImportPresenter.item(batch, item)),
    };
  }

  public static item(batch: ImportBatch, item: ImportItemSnapshot): ImportItemResponse {
    return {
      id: item.id,
      batchId: batch.getId().toString(),
      fileName: item.fileName,
      size: item.size,
      profileId: item.profileId,
      profileName: item.profileName,
      profileVersion: item.profileVersion,
      period: item.period,
      organizationId: item.organizationId,
      countryId: item.countryId,
      currency: item.currency,
      companyId: item.companyId,
      enterpriseId: item.enterpriseId,
      branchId: item.branchId,
      status: item.status,
      total: item.total,
      data: item.data,
      ignored: item.ignored,
      rejected: item.rejected,
      issues: item.issues.map((i: ImportIssue) => ({ line: i.line, messages: i.messages })),
      error: item.error,
      createdAt: item.createdAt.toISOString(),
      finishedAt: item.finishedAt === null ? null : item.finishedAt.toISOString(),
    };
  }
}
