import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { CatalogService } from './application/catalog.service';
import { ImportProcessor } from './application/import.processor';
import { ImportService } from './application/import.service';
import { OrgStructureService } from './application/org-structure.service';
import { ProfileService } from './application/profile.service';
import { RecordsService } from './application/records.service';
import { ReportsAccess } from './application/reports-access';
import {
  DataRecordRepository,
  FieldCatalogRepository,
  FileStorage,
  ImportBatchRepository,
  ImportQueue,
  OrgStructureRepository,
  ProfileRepository,
} from './domain/ports';
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
      controllers: [ReportsConfigController, ProfilesController, ImportsController],
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
        storage,
        { provide: ImportQueue, useClass: InProcessImportQueue },
        ReportsAccess,
        OrgStructureService,
        CatalogService,
        ProfileService,
        ImportService,
        ImportProcessor,
        RecordsService,
      ],
      exports: [
        CatalogService,
        OrgStructureService,
        ProfileService,
        DataRecordRepository,
        ImportQueue,
        ReportsAccess,
      ],
    };
  }
}
