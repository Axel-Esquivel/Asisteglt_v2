import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';

/** Eventos de seguridad auditados (ASVS V7). Los nombres son estables para alertas y búsquedas. */
export enum SecurityEvent {
  LOGIN_SUCCEEDED = 'auth.login.succeeded',
  LOGIN_FAILED = 'auth.login.failed',
  ACCOUNT_LOCKED = 'auth.account.locked',
  LOGIN_WHILE_LOCKED = 'auth.login.while-locked',
  REGISTERED = 'auth.registered',
  LOGGED_OUT = 'auth.logged-out',
  REFRESH_TOKEN_REUSED = 'auth.refresh-token.reused',
  RATE_LIMITED = 'http.rate-limited',
  ACCESS_DENIED = 'http.access-denied',
}

/**
 * Entrada de auditoría. Nunca contiene contraseñas, tokens ni correos en claro: el sujeto es el id
 * del usuario o, si no se conoce, una huella irreversible del identificador presentado.
 */
export class SecurityAuditEntry {
  private constructor(
    public readonly event: SecurityEvent,
    public readonly subject: Nullable<string>,
    public readonly ipAddress: Nullable<string>,
    public readonly detail: Nullable<string>,
  ) {}

  public static of(
    event: SecurityEvent,
    subject: Nullable<string>,
    ipAddress: Nullable<string>,
    detail: Nullable<string>,
  ): SecurityAuditEntry {
    return new SecurityAuditEntry(event, subject, ipAddress, detail);
  }

  /** Huella SHA-256 truncada para correlacionar intentos sin guardar el dato personal. */
  public static fingerprint(identifier: string): string {
    return `fp:${createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex').slice(0, 16)}`;
  }
}

/** Puerto de auditoría de seguridad. */
export abstract class SecurityAuditLog {
  public abstract record(entry: SecurityAuditEntry): void;
}

/** Escribe los eventos como JSON en el log estructurado (contexto `SecurityAudit`, con correlación). */
@Injectable()
export class LoggerSecurityAuditLog extends SecurityAuditLog {
  private readonly logger: Logger = new Logger('SecurityAudit');

  public override record(entry: SecurityAuditEntry): void {
    const payload: Readonly<Record<string, Nullable<string>>> = {
      event: entry.event,
      subject: entry.subject,
      ip: entry.ipAddress,
      detail: entry.detail,
    };
    if (entry.event === SecurityEvent.LOGIN_SUCCEEDED || entry.event === SecurityEvent.REGISTERED) {
      this.logger.log(payload);
      return;
    }
    this.logger.warn(payload);
  }
}

/** Implementación en memoria para pruebas. */
export class RecordingSecurityAuditLog extends SecurityAuditLog {
  private readonly entries: SecurityAuditEntry[] = [];

  public override record(entry: SecurityAuditEntry): void {
    this.entries.push(entry);
  }

  public events(): ReadonlyArray<SecurityEvent> {
    return this.entries.map((entry: SecurityAuditEntry): SecurityEvent => entry.event);
  }

  public all(): ReadonlyArray<SecurityAuditEntry> {
    return [...this.entries];
  }
}
