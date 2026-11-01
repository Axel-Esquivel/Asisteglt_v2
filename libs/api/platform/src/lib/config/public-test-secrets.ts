/**
 * Valores de prueba publicados en el repositorio (`.env.development`, `.env.example`, demostración,
 * e2e). Sirven en desarrollo, pero en producción cualquiera que lea el repositorio podría firmar
 * tokens o descifrar respaldos con ellos.
 */
export class PublicTestSecrets {
  private static readonly MARKERS: ReadonlyArray<string> = [
    'solo-desarrollo',
    'cambia-este-secreto',
    'solo-para-la-demostracion',
    'secreto-e2e',
    'secreto-de-pruebas',
  ];

  public static isPublic(value: string): boolean {
    const normalized: string = value.toLowerCase();
    return PublicTestSecrets.MARKERS.some((marker: string): boolean => normalized.includes(marker));
  }
}
