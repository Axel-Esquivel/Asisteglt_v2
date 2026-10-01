/** Estructura organizacional del proyecto: organización › país (monedas) › compañía › empresa › sucursal. */
export enum OrgLevel {
  ORGANIZATION = 'ORGANIZATION',
  COUNTRY = 'COUNTRY',
  COMPANY = 'COMPANY',
  ENTERPRISE = 'ENTERPRISE',
  BRANCH = 'BRANCH',
}

export interface OrgUnitResponse {
  readonly id: string;
  readonly level: OrgLevel;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly currencies: ReadonlyArray<string>;
}

export interface OrgStructureResponse {
  readonly units: ReadonlyArray<OrgUnitResponse>;
}

export interface CreateOrgUnitRequest {
  readonly level: OrgLevel;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly currencies: ReadonlyArray<string>;
}

export interface UpdateOrgUnitRequest {
  readonly code: string;
  readonly name: string;
  readonly currencies: ReadonlyArray<string>;
}

export enum OrgErrorCode {
  INVALID_ORG_UNIT = 'INVALID_ORG_UNIT',
  ORG_UNIT_NOT_FOUND = 'ORG_UNIT_NOT_FOUND',
  DUPLICATE_ORG_CODE = 'DUPLICATE_ORG_CODE',
  INVALID_PARENT = 'INVALID_PARENT',
  INVALID_CURRENCY = 'INVALID_CURRENCY',
  ORG_UNIT_HAS_CHILDREN = 'ORG_UNIT_HAS_CHILDREN',
}
