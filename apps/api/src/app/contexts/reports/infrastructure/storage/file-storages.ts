import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';
import { AppConfig } from '../../../../config/app-config';
import { FileStorage } from '../../domain/ports';

@Injectable()
export class InMemoryFileStorage extends FileStorage {
  private readonly files: Map<string, Uint8Array> = new Map<string, Uint8Array>();

  public override put(key: string, content: Uint8Array): Promise<void> {
    this.files.set(key, content);
    return Promise.resolve();
  }

  public override get(key: string): Promise<Nullable<Uint8Array>> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
}

/** Archivos en disco local (`STORAGE_DIR`), adecuado para el servidor de la red interna. */
@Injectable()
export class LocalDiskFileStorage extends FileStorage {
  private readonly root: string;

  public constructor(config: AppConfig) {
    super();
    this.root = resolve(config.storageDir);
  }

  public override async put(key: string, content: Uint8Array): Promise<void> {
    const path: string = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  public override async get(key: string): Promise<Nullable<Uint8Array>> {
    try {
      return new Uint8Array(await readFile(this.pathOf(key)));
    } catch {
      return null;
    }
  }

  private pathOf(key: string): string {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes('..')) {
      throw new Error('Clave de archivo inválida');
    }
    return join(this.root, key);
  }
}
