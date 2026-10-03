import { createHash, Hash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';
import { AppConfig } from '../../../../config/app-config';
import { FileStorage, StoredObject } from '../../domain/ports';

/** Calcula tamaño y SHA-256 de lo que pasa por él. */
class Measure {
  private readonly hash: Hash = createHash('sha256');
  private size: number = 0;

  public observe(chunk: Uint8Array): void {
    this.hash.update(chunk);
    this.size += chunk.byteLength;
  }

  public result(): StoredObject {
    return new StoredObject(this.size, this.hash.digest('hex'));
  }
}

@Injectable()
export class InMemoryFileStorage extends FileStorage {
  private static readonly CHUNK: number = 1024 * 1024;
  private readonly files: Map<string, Uint8Array> = new Map<string, Uint8Array>();

  public override put(key: string, content: Uint8Array): Promise<void> {
    this.files.set(key, content);
    return Promise.resolve();
  }

  public override get(key: string): Promise<Nullable<Uint8Array>> {
    return Promise.resolve(this.files.get(key) ?? null);
  }

  public override async write(key: string, chunks: AsyncIterable<Uint8Array>): Promise<StoredObject> {
    const measure: Measure = new Measure();
    const parts: Uint8Array[] = [];
    for await (const chunk of chunks) {
      measure.observe(chunk);
      parts.push(chunk);
    }
    this.files.set(key, Buffer.concat(parts));
    return measure.result();
  }

  public override read(key: string): Promise<Nullable<AsyncIterable<Uint8Array>>> {
    const content: Nullable<Uint8Array> = this.files.get(key) ?? null;
    return Promise.resolve(content === null ? null : InMemoryFileStorage.slices(content));
  }

  private static async *slices(content: Uint8Array): AsyncGenerator<Uint8Array> {
    for (let start = 0; start < content.byteLength; start += InMemoryFileStorage.CHUNK) {
      await Promise.resolve();
      yield content.subarray(start, start + InMemoryFileStorage.CHUNK);
    }
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

  public override async write(key: string, chunks: AsyncIterable<Uint8Array>): Promise<StoredObject> {
    const path: string = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const measure: Measure = new Measure();
    const observer: Transform = new Transform({
      transform(
        chunk: Buffer,
        _encoding: BufferEncoding,
        done: (error: Nullable<Error>, data: Buffer) => void,
      ): void {
        measure.observe(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(Readable.from(chunks), observer, createWriteStream(path));
    } catch (error: unknown) {
      await rm(path, { force: true });
      throw error;
    }
    return measure.result();
  }

  public override async read(key: string): Promise<Nullable<AsyncIterable<Uint8Array>>> {
    const path: string = this.pathOf(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    return createReadStream(path, { highWaterMark: 1024 * 1024 });
  }

  private pathOf(key: string): string {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes('..')) {
      throw new Error('Clave de archivo inválida');
    }
    return join(this.root, key);
  }
}
