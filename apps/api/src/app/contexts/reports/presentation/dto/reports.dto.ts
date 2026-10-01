import {
  Aggregation,
  ApplyTemplateRequest,
  CatalogFieldRequest,
  CatalogTemplate,
  CreateOrgUnitRequest,
  DataType,
  FieldOrigin,
  FieldRole,
  NumericNature,
  OrgLevel,
  RenameFieldRequest,
  UpdateOrgUnitRequest,
} from '@asisteglt/shared-contracts';
import { ArrayMaxSize, IsArray, IsDefined, IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateOrgUnitRequestDto implements CreateOrgUnitRequest {
  @IsDefined()
  @IsEnum(OrgLevel)
  public readonly level!: OrgLevel;

  @ValidateIf((dto: CreateOrgUnitRequestDto): boolean => dto.parentId !== null)
  @IsString()
  @MaxLength(64)
  public readonly parentId!: string | null;

  @IsDefined()
  @IsString()
  @MaxLength(20)
  public readonly code!: string;

  @IsDefined()
  @IsString()
  @MaxLength(120)
  public readonly name!: string;

  @IsDefined()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  public readonly currencies!: string[];
}

export class UpdateOrgUnitRequestDto implements UpdateOrgUnitRequest {
  @IsDefined()
  @IsString()
  @MaxLength(20)
  public readonly code!: string;

  @IsDefined()
  @IsString()
  @MaxLength(120)
  public readonly name!: string;

  @IsDefined()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  public readonly currencies!: string[];
}

export class CatalogFieldRequestDto implements CatalogFieldRequest {
  @IsDefined()
  @IsString()
  @MaxLength(120)
  public readonly label!: string;

  @IsDefined()
  @IsEnum(FieldOrigin)
  public readonly origin!: FieldOrigin;

  @IsDefined()
  @IsEnum(FieldRole)
  public readonly role!: FieldRole;

  @IsDefined()
  @IsEnum(DataType)
  public readonly dataType!: DataType;

  @ValidateIf((dto: CatalogFieldRequestDto): boolean => dto.nature !== null)
  @IsEnum(NumericNature)
  public readonly nature!: NumericNature | null;

  @ValidateIf((dto: CatalogFieldRequestDto): boolean => dto.aggregation !== null)
  @IsEnum(Aggregation)
  public readonly aggregation!: Aggregation | null;

  @ValidateIf((dto: CatalogFieldRequestDto): boolean => dto.describes !== null)
  @IsString()
  @MaxLength(20)
  public readonly describes!: string | null;

  @ValidateIf((dto: CatalogFieldRequestDto): boolean => dto.weightField !== null)
  @IsString()
  @MaxLength(20)
  public readonly weightField!: string | null;
}

export class RenameFieldRequestDto implements RenameFieldRequest {
  @IsDefined()
  @IsString()
  @MaxLength(120)
  public readonly label!: string;
}

export class ApplyTemplateRequestDto implements ApplyTemplateRequest {
  @IsDefined()
  @IsEnum(CatalogTemplate)
  public readonly template!: CatalogTemplate;
}

export class DuplicateProfileRequestDto {
  @IsDefined()
  @IsString()
  @MaxLength(60)
  public readonly name!: string;
}
