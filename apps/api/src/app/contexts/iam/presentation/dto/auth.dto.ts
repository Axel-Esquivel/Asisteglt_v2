import { ChangePasswordRequest, LoginRequest, RegisterRequest, UpdateProfileRequest } from '@asisteglt/shared-contracts';
import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterRequestDto implements RegisterRequest {
  @IsDefined() @IsString() @MaxLength(254)
  public readonly email!: string;

  @IsDefined() @IsString() @MaxLength(128)
  public readonly password!: string;

  @IsDefined() @IsString() @MaxLength(80)
  public readonly displayName!: string;
}

export class LoginRequestDto implements LoginRequest {
  @IsDefined() @IsString() @MaxLength(254)
  public readonly email!: string;

  @IsDefined() @IsString() @MaxLength(128)
  public readonly password!: string;
}

export class UpdateProfileRequestDto implements UpdateProfileRequest {
  @IsDefined() @IsString() @MinLength(1) @MaxLength(80)
  public readonly displayName!: string;
}

export class ChangePasswordRequestDto implements ChangePasswordRequest {
  @IsDefined() @IsString() @MaxLength(128)
  public readonly currentPassword!: string;

  @IsDefined() @IsString() @MaxLength(128)
  public readonly newPassword!: string;
}
