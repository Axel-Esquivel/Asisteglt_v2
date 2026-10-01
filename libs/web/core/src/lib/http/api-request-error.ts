import { DomainError } from '@asisteglt/shared-kernel';

/** Error de una petición HTTP, con el código y estado devueltos por la API. */
export class ApiRequestError extends DomainError {
  public constructor(
    code: string,
    message: string,
    private readonly status: number,
  ) {
    super(code, message);
  }

  public override httpStatus(): number {
    return this.status;
  }
}
