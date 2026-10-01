/** Error de negocio con código estable; la capa HTTP lo traduce con `httpStatus()`. */
export abstract class DomainError extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }

  public abstract httpStatus(): number;
}

export class ValidationError extends DomainError {
  public constructor(code: string, message: string) {
    super(code, message);
  }

  public override httpStatus(): number {
    return 400;
  }
}

export class UnauthorizedError extends DomainError {
  public constructor(code: string, message: string) {
    super(code, message);
  }

  public override httpStatus(): number {
    return 401;
  }
}

export class ForbiddenError extends DomainError {
  public constructor(code: string, message: string) {
    super(code, message);
  }

  public override httpStatus(): number {
    return 403;
  }
}

export class NotFoundError extends DomainError {
  public constructor(code: string, message: string) {
    super(code, message);
  }

  public override httpStatus(): number {
    return 404;
  }
}

export class ConflictError extends DomainError {
  public constructor(code: string, message: string) {
    super(code, message);
  }

  public override httpStatus(): number {
    return 409;
  }
}
