import { Nullable } from '@asisteglt/shared-kernel';

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
      const qrcode = await import('qrcode');
      return await qrcode.toDataURL(text.trim(), { errorCorrectionLevel: 'M', margin: 2, width: 256 });
    } catch {
      return null;
    }
  }

  /** Un enlace con `localhost` no abre en otro equipo: hay que usar la IP de esta computadora. */
  public static isLocalOnly(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());
  }
}
