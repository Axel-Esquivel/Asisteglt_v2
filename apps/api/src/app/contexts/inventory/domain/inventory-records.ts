import { Nullable } from '@asisteglt/shared-kernel';

export interface InventoryItemSnapshot {
  readonly id: string;
  readonly countId: string;
  readonly sku: string;
  readonly description: string;
  readonly unit: string;
  readonly location: string;
  readonly expectedQuantity: string;
  readonly unitCost: Nullable<string>;
}

export interface CountEntrySnapshot {
  readonly id: string;
  readonly countId: string;
  readonly round: number;
  readonly itemId: string;
  readonly counterId: string;
  readonly quantity: string;
  readonly comment: string;
  readonly recordedAt: Date;
}
