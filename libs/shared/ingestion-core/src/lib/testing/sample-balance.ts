/** Reporte de saldos FICTICIO con el estilo "impreso a archivo" (solo para pruebas). */
export const SAMPLE_BALANCE: string = [
  'EMPRESA DEMO, S.A.                                              Pagina:    1',
  'Emision:  05/03/26  09:15:02',
  'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
  '',
  '1.000.000.0000   ACTIVO                           5,200.00   1,300.00     450.00',
  '1.001.001.0000   CAJA Y BANCOS                    5,200.00   1,300.00     450.00',
  '1.001.001.0003      Caja chica                      200.00                 50.00',
  '1.001.001.0007      Banco Demo cuenta 1           5,000.00   1,300.00     400.00',
  '\fEMPRESA DEMO, S.A.                                              Pagina:    2',
  'Emision:  05/03/26  09:15:07',
  'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
  '2.001.00         PROVEEDORES                      -980.00',
  '2.001.001.0001      Proveedor Demo                (980.00)     120.00          ',
].join('\n');
