import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Result } from '@asisteglt/shared-kernel';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config';
import { ApiRequestError } from './api-request-error';
import { Decoder } from './decoder';
import { JsonReader } from './json-reader';

/** Base de los clientes de la API: toda respuesta se decodifica desde `unknown`. */
export abstract class ApiClient {
  private readonly http: HttpClient = inject(HttpClient);
  private readonly config: ApiConfig = inject(ApiConfig);

  protected async get<T>(path: string, decoder: Decoder<T>): Promise<Result<T>> {
    try {
      const body: unknown = await firstValueFrom(this.http.get<unknown>(this.config.url(path)));
      return decoder.decode(body);
    } catch (error: unknown) {
      return Result.fail<T>(ApiClient.toError(error));
    }
  }

  private static toError(error: unknown): ApiRequestError {
    if (error instanceof HttpErrorResponse) {
      const fromBody: Result<ApiRequestError> = JsonReader.from(error.error).flatMap(
        (reader: JsonReader): Result<ApiRequestError> =>
          reader
            .string('code')
            .flatMap((code: string): Result<ApiRequestError> =>
              reader.string('message').map((message: string): ApiRequestError => new ApiRequestError(code, message, error.status)),
            ),
      );
      return fromBody.match(
        (known: ApiRequestError): ApiRequestError => known,
        (): ApiRequestError =>
          new ApiRequestError(
            error.status === 0 ? 'API_UNREACHABLE' : 'HTTP_ERROR',
            error.status === 0 ? 'No se pudo conectar con el servidor' : `Error HTTP ${String(error.status)}`,
            error.status,
          ),
      );
    }
    return new ApiRequestError('UNEXPECTED_CLIENT_ERROR', 'Error inesperado en el cliente', 0);
  }
}
