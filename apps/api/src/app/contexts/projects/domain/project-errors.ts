import { ProjectErrorCode, ProjectPermission } from '@asisteglt/shared-contracts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@asisteglt/shared-kernel';

export class ProjectErrors {
  public static notFound(): NotFoundError {
    return new NotFoundError(ProjectErrorCode.PROJECT_NOT_FOUND, 'El proyecto no existe o no tienes acceso');
  }

  public static invalidName(): ValidationError {
    return new ValidationError(
      ProjectErrorCode.INVALID_PROJECT_NAME,
      'El nombre debe tener entre 3 y 120 caracteres',
    );
  }

  public static denied(permission: ProjectPermission): ForbiddenError {
    return new ForbiddenError(
      ProjectErrorCode.PERMISSION_DENIED,
      `No tienes permiso para esta acción (${permission})`,
    );
  }

  public static roleNotAllowed(): ValidationError {
    return new ValidationError(
      ProjectErrorCode.ROLE_NOT_ALLOWED,
      'El rol no corresponde al módulo del proyecto',
    );
  }

  public static memberNotFound(): NotFoundError {
    return new NotFoundError(ProjectErrorCode.MEMBER_NOT_FOUND, 'El miembro no existe en este proyecto');
  }

  public static alreadyMember(): ConflictError {
    return new ConflictError(ProjectErrorCode.ALREADY_MEMBER, 'La persona ya es miembro del proyecto');
  }

  public static ownerImmutable(): ValidationError {
    return new ValidationError(
      ProjectErrorCode.OWNER_IMMUTABLE,
      'El rol del propietario no se puede cambiar ni quitar',
    );
  }

  public static userNotFound(): NotFoundError {
    return new NotFoundError(
      ProjectErrorCode.USER_NOT_FOUND,
      'No hay ninguna cuenta registrada con ese correo',
    );
  }

  public static shareLinkInvalid(): ValidationError {
    return new ValidationError(
      ProjectErrorCode.SHARE_LINK_INVALID,
      'El vínculo no es válido, expiró o alcanzó su límite',
    );
  }
}
