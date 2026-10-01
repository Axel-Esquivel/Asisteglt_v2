import {
  ColumnSpec,
  DataType,
  DerivedAttributeKind,
  DerivedAttributeSpec,
  EmptyHandling,
  FieldRole,
  FixedWidthSpec,
  IdentifierMaskSpec,
  NumericNature,
  RowRuleKind,
  RowRuleSpec,
  TextOperator,
} from '@asisteglt/shared-contracts';
import {
  Decoder,
  FieldDecoder,
  FieldReader,
  Nullable,
  Result,
  ValidationError,
} from '@asisteglt/shared-kernel';

export class IntegerDecoder extends Decoder<number> {
  public override decode(value: unknown): Result<number> {
    const number: Nullable<number> = typeof value === 'number' && Number.isInteger(value) ? value : null;
    return number === null
      ? Result.fail(new ValidationError('INVALID_JSON_FIELD', 'Se esperaba un entero'))
      : Result.ok(number);
  }
}

/** Decoders de la lectura de ancho fijo, compartidos por la API (peticiones) y el navegador (respuestas). */
export class SpecDecoders {
  public static readonly ROW_RULE: Decoder<RowRuleSpec> = new FieldDecoder<RowRuleSpec>(
    (f: FieldReader): RowRuleSpec => ({
      kind: f.oneOf('kind', Object.values(RowRuleKind)),
      count: f.number('count'),
      operator: f.oneOf('operator', Object.values(TextOperator)),
      text: f.string('text'),
      signatures: f.stringList('signatures'),
    }),
  );

  public static readonly COLUMN: Decoder<ColumnSpec> = new FieldDecoder<ColumnSpec>(
    (f: FieldReader): ColumnSpec => ({
      bandIndex: f.number('bandIndex'),
      fieldKey: f.string('fieldKey'),
      role: f.oneOf('role', Object.values(FieldRole)),
      dataType: f.oneOf('dataType', Object.values(DataType)),
      nature: f.raw('nature') === null ? null : f.oneOf('nature', Object.values(NumericNature)),
      emptyHandling: f.oneOf('emptyHandling', Object.values(EmptyHandling)),
      thousandsSeparator: f.string('thousandsSeparator'),
      decimalSeparator: f.string('decimalSeparator'),
      datePattern: f.string('datePattern'),
      trueText: f.string('trueText'),
      falseText: f.string('falseText'),
    }),
  );

  public static readonly MASK: Decoder<IdentifierMaskSpec> = new FieldDecoder<IdentifierMaskSpec>(
    (f: FieldReader): IdentifierMaskSpec => ({
      fieldKey: f.string('fieldKey'),
      pattern: f.string('pattern'),
    }),
  );

  public static readonly DERIVED: Decoder<DerivedAttributeSpec> = new FieldDecoder<DerivedAttributeSpec>(
    (f: FieldReader): DerivedAttributeSpec => ({
      kind: f.oneOf('kind', Object.values(DerivedAttributeKind)),
      sourceKey: f.string('sourceKey'),
      targetKey: f.string('targetKey'),
      separator: f.string('separator'),
      spacesPerLevel: f.number('spacesPerLevel'),
    }),
  );

  public static readonly SPEC: Decoder<FixedWidthSpec> = new FieldDecoder<FixedWidthSpec>(
    (f: FieldReader): FixedWidthSpec => ({
      encoding: f.string('encoding'),
      tabSize: f.number('tabSize'),
      lineLength: f.number('lineLength'),
      dividers: f.list('dividers', new IntegerDecoder()),
      rowRules: f.list('rowRules', SpecDecoders.ROW_RULE),
      masks: f.list('masks', SpecDecoders.MASK),
      columns: f.list('columns', SpecDecoders.COLUMN),
      derived: f.list('derived', SpecDecoders.DERIVED),
    }),
  );
}
