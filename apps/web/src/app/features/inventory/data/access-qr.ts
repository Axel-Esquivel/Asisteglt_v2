import { Nullable } from '@asisteglt/shared-kernel';
import type * as QrCode from 'qrcode';

/**
 * Código QR para abrir una toma desde el celular en la red local (modo servidor local). La
 * librería se carga solo cuando se pide el código.
 */
export class AccessQr {
  /** Imagen PNG en `data:` del enlace, o `null` si el texto no se puede codificar. */
  public static async dataUrl(text: string): Promise<Nullable<string>> {
    if (text.trim() === '') {
      return null;
    }
    try {
      const qrcode: Nullable<typeof QrCode> = AccessQr.library(await import('qrcode'));
      if (qrcode === null) {
        return null;
      }
      return await qrcode.toDataURL(text.trim(), { errorCorrectionLevel: 'M', margin: 2, width: 256 });
    } catch {
      return null;
    }
  }

  /** Un enlace con `localhost` no abre en otro equipo: hay que usar la IP de esta computadora. */
  public static isLocalOnly(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());
  }

  /**
   * `qrcode` es CommonJS: según el empaquetador, sus funciones llegan como exportaciones con nombre
   * (desarrollo) o solo dentro de `default` (compilación de producción).
   */
  private static library(loaded: unknown): Nullable<typeof QrCode> {
    if (AccessQr.isLibrary(loaded)) {
      return loaded;
    }
    const fallback: unknown =
      typeof loaded === 'object' && loaded !== null && 'default' in loaded ? loaded.default : null;
    return AccessQr.isLibrary(fallback) ? fallback : null;
  }

  private static isLibrary(value: unknown): value is typeof QrCode {
    return (
      typeof value === 'object' &&
      value !== null &&
      'toDataURL' in value &&
      typeof value.toDataURL === 'function'
    );
  }
}
