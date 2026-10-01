/**
 * Objeto de valor: inmutable y comparado por contenido. Cada subclase define su clave de igualdad.
 */
export abstract class ValueObject {
  public equals(other: ValueObject): boolean {
    return other.constructor === this.constructor && other.equalityKey() === this.equalityKey();
  }

  protected abstract equalityKey(): string;
}
