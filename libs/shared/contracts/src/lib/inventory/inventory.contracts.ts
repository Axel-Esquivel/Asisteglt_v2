/** Inventarios: tomas físicas con rondas, asignación por zonas y supervisión (docs/04 §12-13). */
export enum InventoryCountStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
}

export enum ToleranceKind {
  ABSOLUTE = 'ABSOLUTE',
  PERCENT = 'PERCENT',
}

export enum ParticipantRole {
  COUNTER = 'COUNTER',
  SUPERVISOR = 'SUPERVISOR',
}

export enum RoundStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Novedad de un ítem al contarlo: no encontrado (cuenta 0) o dañado; ambos van al reconteo. */
export enum ItemCondition {
  OK = 'OK',
  NOT_FOUND = 'NOT_FOUND',
  DAMAGED = 'DAMAGED',
}

/** Cómo se reparten los ítems de la primera ronda entre los contadores. */
export enum AssignmentMode {
  /** Zonas completas (primer segmento de la ubicación), equilibrando la cantidad de ítems. */
  ZONES = 'ZONES',
  /** Rangos de ubicación elegidos por el supervisor para cada contador. */
  RANGES = 'RANGES',
  /** Por cercanía según las coordenadas X/Y, con cargas equilibradas. */
  CLUSTER = 'CLUSTER',
}

export interface LocationRangeDto {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
}

export interface StartCountRequest {
  readonly mode: AssignmentMode;
  readonly ranges: ReadonlyArray<LocationRangeDto>;
}

export interface CreateCountRequest {
  readonly name: string;
  readonly warehouse: string;
  readonly toleranceKind: ToleranceKind;
  readonly toleranceValue: string;
  readonly maxRounds: number;
}

export interface InventoryItemRequest {
  readonly sku: string;
  readonly description: string;
  readonly unit: string;
  readonly location: string;
  readonly expectedQuantity: string;
  readonly unitCost: string | null;
  /** Coordenadas en metros dentro de la bodega (para asignar por cercanía); opcionales. */
  readonly x: string | null;
  readonly y: string | null;
}

/** Encabezados del catálogo (por clave) que se usan como campos de los ítems. */
export interface ItemFieldMapping {
  readonly sku: string;
  readonly description: string;
  readonly unit: string | null;
  readonly location: string;
  readonly expected: string;
  readonly unitCost: string | null;
  readonly x: string | null;
  readonly y: string | null;
}

/** Carga los ítems desde datos ya cargados en el proyecto (motor de ingestión). */
export interface ItemsFromDataRequest {
  readonly profileId: string | null;
  readonly period: string;
  readonly companyId: string | null;
  readonly mapping: ItemFieldMapping;
}

export interface ReplaceItemsRequest {
  readonly items: ReadonlyArray<InventoryItemRequest>;
}

export interface ParticipantDto {
  readonly userId: string;
  readonly role: ParticipantRole;
}

export interface ParticipantsRequest {
  readonly participants: ReadonlyArray<ParticipantDto>;
}

export interface AssignmentResponse {
  readonly userId: string;
  readonly displayName: string;
  readonly zones: ReadonlyArray<string>;
  readonly assigned: number;
  readonly counted: number;
}

export interface RoundResponse {
  readonly number: number;
  readonly status: RoundStatus;
  readonly items: number;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly assignments: ReadonlyArray<AssignmentResponse>;
}

export interface CountResponse {
  readonly id: string;
  readonly name: string;
  readonly warehouse: string;
  readonly status: InventoryCountStatus;
  readonly toleranceKind: ToleranceKind;
  readonly toleranceValue: string;
  readonly maxRounds: number;
  readonly items: number;
  readonly participants: ReadonlyArray<ParticipantDto>;
  readonly rounds: ReadonlyArray<RoundResponse>;
  readonly createdAt: string;
}

/** Ítem visible para quien cuenta: sin cantidad esperada (conteo a ciegas). */
export interface WorkItemResponse {
  readonly itemId: string;
  readonly sku: string;
  readonly description: string;
  readonly unit: string;
  readonly location: string;
  readonly counted: string | null;
  readonly condition: ItemCondition | null;
  readonly photos: number;
}

export interface MyWorkResponse {
  readonly round: number | null;
  readonly items: ReadonlyArray<WorkItemResponse>;
}

export interface CountEntryRequest {
  readonly itemId: string;
  readonly quantity: string;
  readonly comment: string;
  readonly condition: ItemCondition;
}

/** Pasa a otro contador los ítems que un contador aún no contó en la ronda abierta. */
export interface ReassignRequest {
  readonly fromUserId: string;
  readonly toUserId: string;
}

export interface ItemStatusResponse {
  readonly itemId: string;
  readonly sku: string;
  readonly description: string;
  readonly location: string;
  readonly expected: string;
  readonly counted: string | null;
  readonly difference: string | null;
  readonly differenceValue: string | null;
  readonly exceedsTolerance: boolean;
  readonly rounds: number;
  readonly counterName: string | null;
  readonly condition: ItemCondition | null;
  readonly comment: string;
  readonly photos: number;
}

/** Foto de evidencia de un ítem (el archivo se pide aparte, con autenticación). */
export interface EvidenceResponse {
  readonly id: string;
  readonly itemId: string;
  readonly round: number;
  readonly uploadedBy: string;
  readonly contentType: string;
  readonly createdAt: string;
}

export interface SupervisionResponse {
  readonly count: CountResponse;
  readonly items: ReadonlyArray<ItemStatusResponse>;
  readonly counted: number;
  readonly exceeding: number;
  /** Ítems con novedad (no encontrados o dañados) en su último conteo. */
  readonly issues: number;
  readonly differenceValue: string;
  /** Valorización (solo ítems con costo): esperado = sin contar + contado − diferencia. */
  readonly expectedValue: string;
  readonly countedValue: string;
  readonly uncountedValue: string;
}

export interface InventoryEvent {
  readonly projectId: string;
  readonly countId: string;
}

export enum InventoryErrorCode {
  COUNT_NOT_FOUND = 'COUNT_NOT_FOUND',
  INVALID_COUNT = 'INVALID_COUNT',
  INVALID_ITEMS = 'INVALID_ITEMS',
  INVALID_STATE = 'INVALID_STATE',
  NOT_ASSIGNED = 'NOT_ASSIGNED',
  INVALID_QUANTITY = 'INVALID_QUANTITY',
  INVALID_REASSIGNMENT = 'INVALID_REASSIGNMENT',
  INVALID_EVIDENCE = 'INVALID_EVIDENCE',
  INVALID_MAPPING = 'INVALID_MAPPING',
  FIELD_NATURE_MISMATCH = 'FIELD_NATURE_MISMATCH',
  EVIDENCE_NOT_FOUND = 'EVIDENCE_NOT_FOUND',
}
