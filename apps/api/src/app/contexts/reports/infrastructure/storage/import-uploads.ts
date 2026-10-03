import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Request } from 'express';
import { Nullable } from '@asisteglt/shared-kernel';
import { DiskStorageOptions } from 'multer';
import { AppConfig } from '../../../../config/app-config';

/**
 * Directorio temporal donde la subida escribe los archivos de carga antes de guardarlos. Está
 * dentro de `STORAGE_DIR` (los datos del cliente no salen del volumen protegido) y es propio de
 * cada instancia, para que varias APIs sobre el mismo volumen no se borren los temporales.
 */
@Injectable()
export class ImportUploads implements OnApplicationBootstrap, OnApplicationShutdown {
  public static readonly FOLDER: string = '.uploads';
  /** Temporales de instancias que ya no existen y llevan más de un día sin tocarse. */
  private static readonly STALE_MS: number = 24 * 60 * 60 * 1000;
  private static readonly INSTANCE: string = randomUUID();

  public constructor(private readonly config: AppConfig) {}

  public static directory(storageDir: string): string {
    return join(ImportUploads.root(storageDir), ImportUploads.INSTANCE);
  }

  /** Destino de multer: crea el directorio en cada subida por si se borró entre medias. */
  public static destination(storageDir: string): DiskStorageOptions['destination'] {
    const directory: string = ImportUploads.directory(storageDir);
    return (
      _request: Request,
      _file: Express.Multer.File,
      callback: (error: Nullable<Error>, destination: string) => void,
    ): void => {
      mkdir(directory, { recursive: true }).then(
        (): void => callback(null, directory),
        (error: unknown): void =>
          callback(error instanceof Error ? error : new Error(String(error)), directory),
      );
    };
  }

  public async onApplicationBootstrap(): Promise<void> {
    const root: string = ImportUploads.root(this.config.storageDir);
    const now: number = Date.now();
    const entries: string[] = await readdir(root).catch((): string[] => []);
    for (const entry of entries) {
      if (entry === ImportUploads.INSTANCE) {
        continue;
      }
      const modified: number = (await stat(join(root, entry))).mtimeMs;
      if (now - modified > ImportUploads.STALE_MS) {
        await rm(join(root, entry), { recursive: true, force: true });
      }
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await rm(ImportUploads.directory(this.config.storageDir), { recursive: true, force: true });
  }

  /** Borra los temporales de una petición ya atendida (con éxito o no). */
  public static async discard(paths: ReadonlyArray<string>): Promise<void> {
    await Promise.all(paths.map((path: string): Promise<void> => rm(path, { force: true })));
  }

  private static root(storageDir: string): string {
    return join(resolve(storageDir), ImportUploads.FOLDER);
  }
}
