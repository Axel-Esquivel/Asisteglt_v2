import { DynamicModule, Module } from '@nestjs/common';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { InventoryService } from './application/inventory.service';
import { CountEntryRepository, InventoryCountRepository, InventoryItemRepository } from './domain/ports';
import {
  InMemoryCountEntryRepository,
  InMemoryInventoryCountRepository,
  InMemoryInventoryItemRepository,
} from './infrastructure/memory/in-memory-inventory.repositories';
import {
  MongoCountEntryRepository,
  MongoInventoryCountRepository,
  MongoInventoryItemRepository,
} from './infrastructure/mongo/mongo-inventory.repositories';
import { InventoryController } from './presentation/inventory.controller';

/** Inventarios: tomas físicas, asignación por zonas, conteo a ciegas, supervisión y rondas. */
@Module({})
export class InventoryModule {
  public static register(store: DataStore): DynamicModule {
    return {
      module: InventoryModule,
      global: true,
      controllers: [InventoryController],
      providers: [
        RepositoryBinding.bind(
          InventoryCountRepository,
          store,
          InMemoryInventoryCountRepository,
          MongoInventoryCountRepository,
        ),
        RepositoryBinding.bind(
          InventoryItemRepository,
          store,
          InMemoryInventoryItemRepository,
          MongoInventoryItemRepository,
        ),
        RepositoryBinding.bind(
          CountEntryRepository,
          store,
          InMemoryCountEntryRepository,
          MongoCountEntryRepository,
        ),
        InventoryService,
      ],
      exports: [InventoryService],
    };
  }
}
