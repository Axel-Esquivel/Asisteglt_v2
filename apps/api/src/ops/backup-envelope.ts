import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, stat, writeFile } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { Nullable } from '@asisteglt/shared-kernel';
import { BackupError } from './backup-archive';

/**
 * Sobre binario del respaldo: `AGBK0001` + bandera de cifrado + (sal + IV) + cuerpo gzip +
 * (etiqueta GCM). Con frase de paso el cuerpo va cifrado con AES-256-GCM y una llave derivada con
 * scrypt; la etiqueta autentica todo el contenido, así que un archivo alterado no se restaura.
 */
export class BackupEnvelope {
  private static readonly MAGIC: Buffer = Buffer.from('AGBK0001', 'ascii');
  private static readonly PLAIN: number = 0;
  private static readonly ENCRYPTED: number = 1;
  private static readonly SALT_BYTES: number = 16;
  private static readonly IV_BYTES: number = 12;
  private static readonly TAG_BYTES: number = 16;
  /** Frase de paso mínima: el respaldo contiene datos confidenciales del cliente. */
  public static readonly MIN_PASSPHRASE: number = 12;

  public static async write(
    path: string,
    lines: AsyncIterable<string>,
    passphrase: Nullable<string>,
  ): Promise<void> {
    if (passphrase === null) {
      await writeFile(path, Buffer.concat([BackupEnvelope.MAGIC, Buffer.from([BackupEnvelope.PLAIN])]));
      await pipeline(Readable.from(lines), createGzip(), createWriteStream(path, { flags: 'a' }));
      return;
    }
    BackupEnvelope.assertPassphrase(passphrase);
    const salt: Buffer = randomBytes(BackupEnvelope.SALT_BYTES);
    const iv: Buffer = randomBytes(BackupEnvelope.IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', await BackupEnvelope.key(passphrase, salt), iv);
    await writeFile(
      path,
      Buffer.concat([BackupEnvelope.MAGIC, Buffer.from([BackupEnvelope.ENCRYPTED]), salt, iv]),
    );
    await pipeline(Readable.from(lines), createGzip(), cipher, createWriteStream(path, { flags: 'a' }));
    await appendFile(path, cipher.getAuthTag());
  }

  /** Entrega cada línea en orden; lanza `BackupError` si el archivo no se puede abrir o autenticar. */
  public static async read(
    path: string,
    passphrase: Nullable<string>,
    onLine: (line: string) => Promise<void>,
  ): Promise<void> {
    const size: number = (await stat(path)).size;
    const prefix: Buffer = await BackupEnvelope.readBytes(
      path,
      0,
      BackupEnvelope.MAGIC.length + 1 + BackupEnvelope.SALT_BYTES + BackupEnvelope.IV_BYTES,
    );
    if (!prefix.subarray(0, BackupEnvelope.MAGIC.length).equals(BackupEnvelope.MAGIC)) {
      throw new BackupError('El archivo no es un respaldo de AsisteGLT');
    }
    const flag: number = prefix[BackupEnvelope.MAGIC.length] ?? -1;
    const lines: Transform = BackupEnvelope.lineSplitter(onLine);
    try {
      if (flag === BackupEnvelope.PLAIN) {
        await pipeline(
          createReadStream(path, { start: BackupEnvelope.MAGIC.length + 1 }),
          createGunzip(),
          lines,
        );
        return;
      }
      if (flag !== BackupEnvelope.ENCRYPTED) {
        throw new BackupError('Formato de sobre desconocido');
      }
      if (passphrase === null) {
        throw new BackupError('El respaldo está cifrado: define BACKUP_PASSPHRASE');
      }
      const saltStart: number = BackupEnvelope.MAGIC.length + 1;
      const salt: Buffer = prefix.subarray(saltStart, saltStart + BackupEnvelope.SALT_BYTES);
      const iv: Buffer = prefix.subarray(saltStart + BackupEnvelope.SALT_BYTES);
      const bodyStart: number = saltStart + BackupEnvelope.SALT_BYTES + BackupEnvelope.IV_BYTES;
      const tagStart: number = size - BackupEnvelope.TAG_BYTES;
      if (tagStart <= bodyStart) {
        throw new BackupError('El respaldo está incompleto');
      }
      const decipher = createDecipheriv('aes-256-gcm', await BackupEnvelope.key(passphrase, salt), iv);
      decipher.setAuthTag(await BackupEnvelope.readBytes(path, tagStart, BackupEnvelope.TAG_BYTES));
      await pipeline(
        createReadStream(path, { start: bodyStart, end: tagStart - 1 }),
        decipher,
        createGunzip(),
        lines,
      );
    } catch (error: unknown) {
      if (error instanceof BackupError) {
        throw error;
      }
      throw new BackupError(
        flag === BackupEnvelope.ENCRYPTED
          ? 'No se pudo descifrar: frase de paso incorrecta o archivo dañado'
          : 'No se pudo leer el respaldo: archivo dañado',
      );
    }
  }

  public static assertPassphrase(passphrase: string): void {
    if (passphrase.length < BackupEnvelope.MIN_PASSPHRASE) {
      throw new BackupError(
        `BACKUP_PASSPHRASE debe tener al menos ${String(BackupEnvelope.MIN_PASSPHRASE)} caracteres`,
      );
    }
  }

  /** Separa el flujo descomprimido en líneas y espera a que cada una se procese. */
  private static lineSplitter(onLine: (line: string) => Promise<void>): Transform {
    let pending: string = '';
    return new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, done: (error: Nullable<Error>) => void): void {
        pending += chunk.toString('utf8');
        const parts: string[] = pending.split('\n');
        pending = parts.pop() ?? '';
        BackupEnvelope.sequence(parts, onLine).then(
          (): void => done(null),
          (error: unknown): void => done(error instanceof Error ? error : new Error(String(error))),
        );
      },
      flush(done: (error: Nullable<Error>) => void): void {
        const rest: string[] = pending === '' ? [] : [pending];
        BackupEnvelope.sequence(rest, onLine).then(
          (): void => done(null),
          (error: unknown): void => done(error instanceof Error ? error : new Error(String(error))),
        );
      },
    });
  }

  private static async sequence(
    lines: ReadonlyArray<string>,
    onLine: (line: string) => Promise<void>,
  ): Promise<void> {
    for (const line of lines) {
      if (line !== '') {
        await onLine(line);
      }
    }
  }

  private static key(passphrase: string, salt: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve: (key: Buffer) => void, reject: (error: Error) => void): void => {
      scrypt(
        passphrase,
        salt,
        32,
        { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error: Nullable<Error>, key: Buffer): void => {
          if (error !== null) {
            reject(error);
            return;
          }
          resolve(key);
        },
      );
    });
  }

  private static async readBytes(path: string, position: number, length: number): Promise<Buffer> {
    const handle = await open(path, 'r');
    try {
      const buffer: Buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}
