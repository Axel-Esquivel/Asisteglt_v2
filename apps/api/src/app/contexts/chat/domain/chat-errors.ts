import { ChatErrorCode } from '@asisteglt/shared-contracts';
import { ForbiddenError, NotFoundError, ValidationError } from '@asisteglt/shared-kernel';

export class ChatErrors {
  public static conversationNotFound(): NotFoundError {
    return new NotFoundError(
      ChatErrorCode.CONVERSATION_NOT_FOUND,
      'La conversación no existe o no tienes acceso',
    );
  }

  public static invalidMessage(): ValidationError {
    return new ValidationError(
      ChatErrorCode.INVALID_MESSAGE,
      'El mensaje debe tener entre 1 y 4000 caracteres',
    );
  }

  public static messageNotFound(): NotFoundError {
    return new NotFoundError(ChatErrorCode.MESSAGE_NOT_FOUND, 'El mensaje no existe');
  }

  public static notAuthor(): ForbiddenError {
    return new ForbiddenError(ChatErrorCode.NOT_MESSAGE_AUTHOR, 'Solo el autor puede modificar el mensaje');
  }

  public static invalidDirectTarget(): ValidationError {
    return new ValidationError(
      ChatErrorCode.INVALID_DIRECT_TARGET,
      'Elige otra persona registrada para conversar',
    );
  }
}
