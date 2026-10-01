import { LoggerService } from '@nestjs/common';
import { Nullable } from '@asisteglt/shared-kernel';
import { LogLevel } from '../config/runtime';
import { CorrelationContext } from '../correlation/correlation-context';

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly context: Nullable<string>;
  readonly correlationId: Nullable<string>;
  readonly message: string;
}

/** Logger estructurado en JSON (una línea por evento) con identificador de correlación. */
export class JsonLogger implements LoggerService {
  private static readonly ORDER: ReadonlyArray<LogLevel> = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

  public constructor(
    private readonly minimumLevel: LogLevel,
    private readonly sink: (line: string) => void,
  ) {}

  public static toStdout(minimumLevel: LogLevel): JsonLogger {
    return new JsonLogger(minimumLevel, (line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  }

  public log(message: unknown, ...context: unknown[]): void {
    this.write(LogLevel.INFO, message, context);
  }

  public error(message: unknown, ...context: unknown[]): void {
    this.write(LogLevel.ERROR, message, context);
  }

  public warn(message: unknown, ...context: unknown[]): void {
    this.write(LogLevel.WARN, message, context);
  }

  public debug(message: unknown, ...context: unknown[]): void {
    this.write(LogLevel.DEBUG, message, context);
  }

  public verbose(message: unknown, ...context: unknown[]): void {
    this.write(LogLevel.DEBUG, message, context);
  }

  private write(level: LogLevel, message: unknown, context: ReadonlyArray<unknown>): void {
    if (JsonLogger.ORDER.indexOf(level) < JsonLogger.ORDER.indexOf(this.minimumLevel)) {
      return;
    }
    const lastContext: unknown = context.length > 0 ? context[context.length - 1] : null;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: typeof lastContext === 'string' ? lastContext : null,
      correlationId: CorrelationContext.current(),
      message: JsonLogger.describe(message),
    };
    this.sink(JSON.stringify(entry));
  }

  private static describe(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return `${message.name}: ${message.message}`;
    }
    return JSON.stringify(message);
  }
}
