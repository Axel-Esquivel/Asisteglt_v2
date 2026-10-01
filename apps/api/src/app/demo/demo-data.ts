/**
 * Datos de demostración 100 % FICTICIOS (nunca datos de clientes). Sirven para probar la
 * aplicación sin preparar archivos: un balance de saldos «impreso a archivo» y una bodega.
 */
export class DemoData {
  public static readonly PASSWORD: string = 'DemoAsiste2026';

  public static readonly USERS: ReadonlyArray<{ readonly email: string; readonly name: string }> = [
    { email: 'admin@demo.asisteglt.local', name: 'Administración Demo' },
    { email: 'analista@demo.asisteglt.local', name: 'Analista Demo' },
    { email: 'contador1@demo.asisteglt.local', name: 'Contador Uno' },
    { email: 'contador2@demo.asisteglt.local', name: 'Contador Dos' },
  ];

  public static balance(month: string, cash: string): string {
    const pad = (value: string): string => value.padStart(10);
    return [
      'EMPRESA DEMO, S.A.                                              Pagina:    1',
      `Emision:  05/${month}/26  09:15:02`,
      'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
      '',
      `1.000.000.0000   ACTIVO                         ${pad(cash)}   1,300.00     450.00`,
      `1.001.001.0000   CAJA Y BANCOS                  ${pad(cash)}   1,300.00     450.00`,
      '1.001.001.0003      Caja chica                      200.00                 50.00',
      '1.001.001.0007      Banco Demo cuenta 1           5,000.00   1,300.00     400.00',
      '2.000.000.0000   PASIVO                          -1,980.00     120.00     300.00',
      '2.001.001.0001      Proveedor Demo                (980.00)     120.00          ',
      '2.001.001.0002      Proveedor Ficticio          (1,000.00)                300.00',
      '\fEMPRESA DEMO, S.A.                                              Pagina:    2',
      `Emision:  05/${month}/26  09:15:07`,
      'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
      '4.000.000.0000   INGRESOS                        -3,500.00                700.00',
      '4.001.001.0001      Ventas demo                 (3,500.00)                700.00',
    ].join('\n');
  }

  public static readonly ITEMS: ReadonlyArray<readonly [string, string, string, string, string]> = [
    ['P-001', 'Tornillo demo 1/4', 'A-01-01', '120', '0.35'],
    ['P-002', 'Tuerca demo 1/4', 'A-01-02', '200', '0.10'],
    ['P-003', 'Arandela demo', 'A-02-01', '75', '0.05'],
    ['P-004', 'Clavo demo 2"', 'B-01-01', '500', '0.02'],
    ['P-005', 'Martillo demo', 'B-01-02', '12', '8.50'],
    ['P-006', 'Cinta métrica demo', 'B-02-01', '20', '4.75'],
    ['P-007', 'Guantes demo', 'C-01-01', '40', '2.10'],
    ['P-008', 'Casco demo', 'C-01-02', '15', '12.00'],
  ];
}
