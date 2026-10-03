import { ItemCondition } from '@asisteglt/shared-contracts';
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
  readonly x: Nullable<string>;
  readonly y: Nullable<string>;
}

export interface CountEntrySnapshot {
  readonly id: string;
  readonly countId: string;
  readonly round: number;
  readonly itemId: string;
  readonly counterId: string;
  readonly quantity: string;
  readonly comment: string;
  readonly condition: ItemCondition;
  readonly recordedAt: Date;
}

/** Foto de evidencia: el archivo vive en el almacén de archivos, aquí solo su referencia. */
export interface EvidenceSnapshot {
  readonly id: string;
  readonly countId: string;
  readonly itemId: string;
  readonly round: number;
  readonly userId: string;
  readonly contentType: string;
  readonly size: number;
  readonly storageKey: string;
  readonly createdAt: Date;
}
