import {
  AddMemberRequest,
  ChangeMemberRoleRequest,
  CreateProjectRequest,
  CreateShareLinkRequest,
  ModuleType,
  ProjectRole,
  RedeemShareLinkRequest,
  UpdateProjectRequest,
} from '@asisteglt/shared-contracts';
import { IsDefined, IsEnum, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateProjectRequestDto implements CreateProjectRequest {
  @IsDefined() @IsString() @MaxLength(120)
  public readonly name!: string;

  @IsDefined() @IsString() @MaxLength(1000)
  public readonly description!: string;

  @IsDefined() @IsEnum(ModuleType)
  public readonly moduleType!: ModuleType;
}

export class UpdateProjectRequestDto implements UpdateProjectRequest {
  @IsDefined() @IsString() @MaxLength(120)
  public readonly name!: string;

  @IsDefined() @IsString() @MaxLength(1000)
  public readonly description!: string;
}

export class AddMemberRequestDto implements AddMemberRequest {
  @IsDefined() @IsString() @MaxLength(254)
  public readonly email!: string;

  @IsDefined() @IsEnum(ProjectRole)
  public readonly role!: ProjectRole;
}

export class ChangeMemberRoleRequestDto implements ChangeMemberRoleRequest {
  @IsDefined() @IsEnum(ProjectRole)
  public readonly role!: ProjectRole;
}

export class CreateShareLinkRequestDto implements CreateShareLinkRequest {
  @IsDefined() @IsEnum(ProjectRole)
  public readonly role!: ProjectRole;

  @ValidateIf((dto: CreateShareLinkRequestDto): boolean => dto.expiresInDays !== null)
  @IsInt() @Min(1) @Max(365)
  public readonly expiresInDays!: number | null;

  @ValidateIf((dto: CreateShareLinkRequestDto): boolean => dto.maxUses !== null)
  @IsInt() @Min(1) @Max(10_000)
  public readonly maxUses!: number | null;
}

export class RedeemShareLinkRequestDto implements RedeemShareLinkRequest {
  @IsDefined() @IsString() @MaxLength(200)
  public readonly token!: string;
}
