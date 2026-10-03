import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Nullable } from '@asisteglt/shared-kernel';
import { mongo } from 'mongoose';
import { MongoDatabase } from '../common/persistence/mongo-database';

/** Dependencia que debe responder para que la API reciba tráfico. `check` lanza si falla. */
export abstract class ReadinessProbe {
  public abstract name(): string;

  public abstract check(): Promise<void>;
}

/** MongoDB responde a `ping` dentro del tiempo límite. */
export class MongoReadinessProbe extends ReadinessProbe {
  public constructor(private readonly database: MongoDatabase) {
    super();
  }

  public name(): string {
    return 'mongodb';
  }

  public async check(): Promise<void> {
    const db: Nullable<mongo.Db> = this.database.connection.db ?? null;
    if (db === null) {
      throw new Error('Sin conexión');
    }
    await db.admin().ping();
  }
}

/** El directorio de archivos existe y admite escritura. */
export class StorageReadinessProbe extends ReadinessProbe {
  private readonly root: string;

  public constructor(directory: string) {
    super();
    this.root = resolve(directory);
  }

  public name(): string {
    return 'storage';
  }

  public async check(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK);
  }
}

/** Conjunto de comprobaciones registradas según el almacén configurado. */
export class ReadinessProbes {
  public constructor(public readonly probes: ReadonlyArray<ReadinessProbe>) {}
}
