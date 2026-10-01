import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { DataStore } from './data-store';
import { MongoDatabase } from './mongo-database';

/** Registra la conexión MongoDB solo cuando `DATA_STORE=mongo`. */
@Global()
@Module({})
export class PersistenceModule {
  public static forRoot(store: DataStore): DynamicModule {
    const providers: Provider[] =
      store === DataStore.MONGO
        ? [
            {
              provide: MongoDatabase,
              useFactory: (config: AppConfig): Promise<MongoDatabase> =>
                MongoDatabase.connect(config.mongoUri),
              inject: [AppConfig],
            },
          ]
        : [];
    return { module: PersistenceModule, providers, exports: providers };
  }
}

/** Elige la implementación de un repositorio según el almacén configurado. */
export class RepositoryBinding {
  public static bind<T>(
    port: abstract new (...args: never[]) => T,
    store: DataStore,
    memory: Type<T>,
    mongo: Type<T>,
  ): Provider {
    return { provide: port, useClass: store === DataStore.MONGO ? mongo : memory };
  }
}
