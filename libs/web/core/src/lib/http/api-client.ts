import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Decoder, JsonReader, Result } from '@asisteglt/shared-kernel';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config';
import { ApiRequestError } from './api-request-error';

/** Base de los clientes de la API: toda respuesta se decodifica desde `unknown`. */
export abstract class ApiClient {
  private readonly http: HttpClient = inject(HttpClient);
  private readonly config: ApiConfig = inject(ApiConfig);

  protected get<T>(path: string, decoder: Decoder<T>): Promise<Result<T>> {
    return this.request('GET', path, null, decoder);
  }

  protected post<T>(path: string, body: object | null, decoder: Decoder<T>): Promise<Result<T>> {
    return this.request('POST', path, body, decoder);
  }

  protected put<T>(path: string, body: object | null, decoder: Decoder<T>): Promise<Result<T>> {
    return this.request('PUT', path, body, decoder);
  }

  protected patch<T>(path: string, body: object | null, decoder: Decoder<T>): Promise<Result<T>> {
    return this.request('PATCH', path, body, decoder);
  }

  protected delete<T>(path: string, decoder: Decoder<T>): Promise<Result<T>> {
    return this.request('DELETE', path, null, decoder);
  }

  /** Archivo binario (p. ej. una foto) con la sesión del usuario. */
  protected async getBlob(path: string): Promise<Result<Blob>> {
    try {
      return Result.ok(
        await firstValueFrom(
          this.http.get(this.config.url(path), { responseType: 'blob', withCredentials: true }),
        ),
      );
    } catch (error: unknown) {
      return Result.fail<Blob>(ApiClient.toError(error));
    }
  }

  protected async upload<T>(path: string, form: FormData, decoder: Decoder<T>): Promise<Result<T>> {
    try {
      const response: unknown = await firstValueFrom(this.http.post<unknown>(this.config.url(path), form));
      return decoder.decode(response);
    } catch (error: unknown) {
      return Result.fail<T>(ApiClient.toError(error));
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body: object | null,
    decoder: Decoder<T>,
  ): Promise<Result<T>> {
    try {
      const response: unknown = await firstValueFrom(
        this.http.request<unknown>(method, this.config.url(path), { body, withCredentials: true }),
      );
      return decoder.decode(response);
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
              reader
                .string('message')
                .map((message: string): ApiRequestError => new ApiRequestError(code, message, error.status)),
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
