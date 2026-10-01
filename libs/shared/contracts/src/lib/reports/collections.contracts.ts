import { DataType, NumericNature } from './catalog.contracts';

/** Colecciones complementarias (tipos de cambio, sueldos…): esquema propio y filas capturadas (RF-REP-07). */
export interface CollectionFieldDto {
  /** Clave interna; vacía al crear un campo nuevo. */
  readonly key: string;
  readonly label: string;
  readonly dataType: DataType;
  readonly nature: NumericNature | null;
}

export interface CollectionRowDto {
  readonly id: string;
  /** Período `AAAA-MM` al que aplica la fila, o `null` si aplica a todos. */
  readonly period: string | null;
  /** Valores por clave de campo: decimal canónico en texto, texto, fecha, sí/no o vacío. */
  readonly values: Readonly<Record<string, string | boolean | null>>;
}

export interface CollectionRequest {
  readonly name: string;
  readonly fields: ReadonlyArray<CollectionFieldDto>;
  readonly rows: ReadonlyArray<CollectionRowDto>;
}

export interface CollectionResponse extends CollectionRequest {
  readonly id: string;
  readonly updatedAt: string;
}

export enum CollectionErrorCode {
  INVALID_COLLECTION = 'INVALID_COLLECTION',
  COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND',
  COLLECTION_IN_USE = 'COLLECTION_IN_USE',
}
