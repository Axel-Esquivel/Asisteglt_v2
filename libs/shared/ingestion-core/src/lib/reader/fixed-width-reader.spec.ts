import { DataType, FieldRole, NumericNature } from '@asisteglt/shared-contracts';
import { FixedWidthLayout } from '../layout/fixed-width-layout';
import { BoundarySuggester } from '../layout/boundary-suggester';
import { CrossingDetector, DividerCrossing } from '../layout/crossing-detector';
import { ColumnDefaults, ColumnSpec, DerivedAttributeKind } from '../parse/column-spec';
import { PageHeaderBlockRule, RowRuleSpec, SkipBlankLinesRule, SkipPageBreaksRule } from '../rules/row-rules';
import { TextMask } from '../rules/text-mask';
import { SAMPLE_BALANCE } from '../testing/sample-balance';
import { TextDocument, TextEncoding } from '../text/text-document';
import { TextLine } from '../text/text-line';
import { FixedWidthReader } from './fixed-width-reader';
import { FixedWidthSpec } from './fixed-width-spec';
import { DataLine, IgnoredLine, LineClassification, RejectedLine } from './line-classification';

describe('FixedWidthReader', () => {
  const document: TextDocument = TextDocument.fromText(SAMPLE_BALANCE, TextEncoding.UTF8, 8);
  const lines: ReadonlyArray<TextLine> = document.all();
  const header: TextLine[] = lines.slice(0, 3).map((l: TextLine): TextLine => l);
  const amount = (band: number, key: string): ColumnSpec =>
    ColumnDefaults.create(band, key, FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT);
  const rules: RowRuleSpec[] = [
    new SkipBlankLinesRule().toSpec(),
    new SkipPageBreaksRule().toSpec(),
    PageHeaderBlockRule.fromLines(header).toSpec(),
  ];
  const spec: FixedWidthSpec = {
    encoding: TextEncoding.UTF8,
    tabSize: 8,
    lineLength: document.maxLineLength(),
    dividers: [17, 47, 58, 69],
    rowRules: rules,
    masks: [{ fieldKey: 'f_code', pattern: TextMask.fromSample('1.001.001.0000').pattern }],
    columns: [
      ColumnDefaults.create(0, 'f_code', FieldRole.IDENTIFIER, DataType.TEXT, null),
      ColumnDefaults.create(1, 'f_name', FieldRole.IDENTIFIER_NAME, DataType.TEXT, null),
      amount(2, 'f_prev'),
      amount(3, 'f_debit'),
      amount(4, 'f_credit'),
    ],
    derived: [
      {
        kind: DerivedAttributeKind.CODE_SEGMENTS_LEVEL,
        sourceKey: 'f_code',
        targetKey: 'f_level',
        separator: '.',
        spacesPerLevel: 3,
      },
      {
        kind: DerivedAttributeKind.LEAF_FLAG,
        sourceKey: 'f_code',
        targetKey: 'f_leaf',
        separator: '.',
        spacesPerLevel: 3,
      },
    ],
  };
  const labels: ReadonlyMap<string, string> = new Map([['f_code', 'Código de cuenta']]);
  const reader: FixedWidthReader = FixedWidthReader.create(spec, labels).unwrap();
  const result: LineClassification[] = reader.classifyAll(lines);

  it('ignora encabezados repetidos con fecha y página variables', () => {
    expect(result[8]).toBeInstanceOf(IgnoredLine);
    expect(result[9]).toBeInstanceOf(IgnoredLine);
    expect(FixedWidthReader.summarize(result)).toMatchObject({ total: 13, data: 5, ignored: 7, rejected: 1 });
  });

  it('convierte montos, vacíos como cero, negativos y atributos derivados', () => {
    const chica: LineClassification | null = result[6] ?? null;
    expect(chica).toBeInstanceOf(DataLine);
    expect(chica instanceof DataLine ? chica.values : null).toEqual({
      f_code: '1.001.001.0003',
      f_name: 'Caja chica',
      f_prev: '200',
      f_debit: '0',
      f_credit: '50',
      f_level: '4',
      f_leaf: true,
    });
    const supplier: LineClassification | null = result[12] ?? null;
    expect(supplier instanceof DataLine ? supplier.values['f_prev'] : null).toBe('-980');
    const parent: LineClassification | null = result[5] ?? null;
    expect(parent instanceof DataLine ? parent.values['f_level'] : null).toBe('3');
  });

  it('rechaza con motivo la línea que no cumple la máscara', () => {
    const rejected: LineClassification | null = result[11] ?? null;
    expect(rejected).toBeInstanceOf(RejectedLine);
    expect(rejected instanceof RejectedLine ? rejected.issues : []).toEqual([
      '«Código de cuenta» no cumple la máscara 9.999.999.9999',
    ]);
  });

  it('sugiere divisorias que no cortan valores', () => {
    const dataLines: TextLine[] = lines.filter((l: TextLine): boolean => /^\d/.test(l.text));
    const suggested: number[] = BoundarySuggester.standard().suggest(lines);
    expect(BoundarySuggester.standard().suggest(dataLines)).toEqual(suggested);
    const layout: FixedWidthLayout = FixedWidthLayout.of(suggested, document.maxLineLength()).unwrap();
    expect(suggested.length).toBeGreaterThanOrEqual(4);
    expect(new CrossingDetector().detect(dataLines, layout)).toEqual([]);
    const bad: FixedWidthLayout = FixedWidthLayout.of([52], document.maxLineLength()).unwrap();
    const crossing: DividerCrossing | null = new CrossingDetector().detect(dataLines, bad)[0] ?? null;
    expect(crossing === null ? '' : crossing.message()).toContain('corta «5,200.00»');
  });

  it('valida el movimiento de divisorias', () => {
    const layout: FixedWidthLayout = FixedWidthLayout.of([10, 20], 40).unwrap();
    expect(layout.moveDivider(10, 25).isOk()).toBe(false);
    expect(layout.moveDivider(10, 15).unwrap().dividers()).toEqual([15, 20]);
    expect(layout.bands().map((b) => b.width())).toEqual([10, 10, 20]);
  });
});
