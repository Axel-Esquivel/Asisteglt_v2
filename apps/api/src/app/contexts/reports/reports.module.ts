import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { AnalysisService } from './application/analysis.service';
import { OperationsService } from './application/operations.service';
import { InMemoryOperationPipelineRepository } from './infrastructure/memory/in-memory-operations.repository';
import { MongoOperationPipelineRepository } from './infrastructure/mongo/mongo-operations.repository';
import { OperationsController } from './presentation/operations.controller';
import { CatalogService } from './application/catalog.service';
import { ImportProcessor } from './application/import.processor';
import { ImportService } from './application/import.service';
import { OrgStructureService } from './application/org-structure.service';
import { ProfileService } from './application/profile.service';
import { RecordsService } from './application/records.service';
import { ReportsAccess } from './application/reports-access';
import {
  ClassificationRepository,
  OperationPipelineRepository,
  DataRecordRepository,
  FieldCatalogRepository,
  FileStorage,
  ImportBatchRepository,
  ImportQueue,
  OrgStructureRepository,
  ProfileRepository,
  ReportDefinitionRepository,
} from './domain/ports';
import {
  InMemoryClassificationRepository,
  InMemoryReportDefinitionRepository,
} from './infrastructure/memory/in-memory-analysis.repositories';
import {
  MongoClassificationRepository,
  MongoReportDefinitionRepository,
} from './infrastructure/mongo/mongo-analysis.repositories';
import { InProcessImportQueue } from './infrastructure/in-process-import.queue';
import {
  InMemoryDataRecordRepository,
  InMemoryFieldCatalogRepository,
  InMemoryImportBatchRepository,
  InMemoryOrgStructureRepository,
  InMemoryProfileRepository,
} from './infrastructure/memory/in-memory-reports.repositories';
import {
  MongoDataRecordRepository,
  MongoFieldCatalogRepository,
  MongoImportBatchRepository,
  MongoOrgStructureRepository,
  MongoProfileRepository,
} from './infrastructure/mongo/mongo-reports.repositories';
import { InMemoryFileStorage, LocalDiskFileStorage } from './infrastructure/storage/file-storages';
import { AnalysisController } from './presentation/analysis.controller';
import { ImportsController } from './presentation/imports.controller';
import { ProfilesController } from './presentation/profiles.controller';
import { ReportsConfigController } from './presentation/reports-config.controller';

/** Reportes: estructura organizacional, catálogo de encabezados, preconfiguraciones e importación. */
@Module({})
export class ReportsModule {
  public static register(store: DataStore): DynamicModule {
    const storage: Provider = {
      provide: FileStorage,
      useClass: store === DataStore.MONGO ? LocalDiskFileStorage : InMemoryFileStorage,
    };
    return {
      module: ReportsModule,
      global: true,
      controllers: [
        ReportsConfigController,
        ProfilesController,
        ImportsController,
        AnalysisController,
        OperationsController,
      ],
      providers: [
        RepositoryBinding.bind(
          OrgStructureRepository,
          store,
          InMemoryOrgStructureRepository,
          MongoOrgStructureRepository,
        ),
        RepositoryBinding.bind(
          FieldCatalogRepository,
          store,
          InMemoryFieldCatalogRepository,
          MongoFieldCatalogRepository,
        ),
        RepositoryBinding.bind(ProfileRepository, store, InMemoryProfileRepository, MongoProfileRepository),
        RepositoryBinding.bind(
          ImportBatchRepository,
          store,
          InMemoryImportBatchRepository,
          MongoImportBatchRepository,
        ),
        RepositoryBinding.bind(
          DataRecordRepository,
          store,
          InMemoryDataRecordRepository,
          MongoDataRecordRepository,
        ),
        RepositoryBinding.bind(
          ClassificationRepository,
          store,
          InMemoryClassificationRepository,
          MongoClassificationRepository,
        ),
        RepositoryBinding.bind(
          ReportDefinitionRepository,
          store,
          InMemoryReportDefinitionRepository,
          MongoReportDefinitionRepository,
        ),
        RepositoryBinding.bind(
          OperationPipelineRepository,
          store,
          InMemoryOperationPipelineRepository,
          MongoOperationPipelineRepository,
        ),
        storage,
        { provide: ImportQueue, useClass: InProcessImportQueue },
        ReportsAccess,
        OrgStructureService,
        CatalogService,
        ProfileService,
        ImportService,
        ImportProcessor,
        RecordsService,
        AnalysisService,
        OperationsService,
      ],
      exports: [
        CatalogService,
        OrgStructureService,
        ProfileService,
        ImportService,
        AnalysisService,
        OperationsService,
        DataRecordRepository,
        ImportQueue,
        ReportsAccess,
      ],
    };
  }
}
