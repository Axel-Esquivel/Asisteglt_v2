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
}

export interface MyWorkResponse {
  readonly round: number | null;
  readonly items: ReadonlyArray<WorkItemResponse>;
}

export interface CountEntryRequest {
  readonly itemId: string;
  readonly quantity: string;
  readonly comment: string;
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
}

export interface SupervisionResponse {
  readonly count: CountResponse;
  readonly items: ReadonlyArray<ItemStatusResponse>;
  readonly counted: number;
  readonly exceeding: number;
  readonly differenceValue: string;
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
}
