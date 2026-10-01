import {
  ColumnSpec,
  DataType,
  DerivedAttributeKind,
  DerivedAttributeSpec,
  EmptyHandling,
  FieldRole,
  FixedWidthSpec,
  IdentifierMaskSpec,
  ImportItemRequest,
  ImportManifest,
  NumericNature,
  ProfileRequest,
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

/** Valida los cuerpos JSON anidados (preconfiguraciones y manifiestos de carga) recibidos como `unknown`. */
export class ReportsRequestParser {
  private static readonly ROW_RULE: Decoder<RowRuleSpec> = new FieldDecoder<RowRuleSpec>(
    (f: FieldReader): RowRuleSpec => ({
      kind: f.oneOf('kind', Object.values(RowRuleKind)),
      count: f.number('count'),
      operator: f.oneOf('operator', Object.values(TextOperator)),
      text: f.string('text'),
      signatures: f.stringList('signatures'),
    }),
  );

  private static readonly COLUMN: Decoder<ColumnSpec> = new FieldDecoder<ColumnSpec>(
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

  private static readonly MASK: Decoder<IdentifierMaskSpec> = new FieldDecoder<IdentifierMaskSpec>(
    (f: FieldReader): IdentifierMaskSpec => ({
      fieldKey: f.string('fieldKey'),
      pattern: f.string('pattern'),
    }),
  );

  private static readonly DERIVED: Decoder<DerivedAttributeSpec> = new FieldDecoder<DerivedAttributeSpec>(
    (f: FieldReader): DerivedAttributeSpec => ({
      kind: f.oneOf('kind', Object.values(DerivedAttributeKind)),
      sourceKey: f.string('sourceKey'),
      targetKey: f.string('targetKey'),
      separator: f.string('separator'),
      spacesPerLevel: f.number('spacesPerLevel'),
    }),
  );

  private static readonly SPEC: Decoder<FixedWidthSpec> = new FieldDecoder<FixedWidthSpec>(
    (f: FieldReader): FixedWidthSpec => ({
      encoding: f.string('encoding'),
      tabSize: f.number('tabSize'),
      lineLength: f.number('lineLength'),
      dividers: f.list('dividers', new NumberDecoder()),
      rowRules: f.list('rowRules', ReportsRequestParser.ROW_RULE),
      masks: f.list('masks', ReportsRequestParser.MASK),
      columns: f.list('columns', ReportsRequestParser.COLUMN),
      derived: f.list('derived', ReportsRequestParser.DERIVED),
    }),
  );

  private static readonly PROFILE: Decoder<ProfileRequest> = new FieldDecoder<ProfileRequest>(
    (f: FieldReader): ProfileRequest => ({
      name: f.string('name'),
      description: f.string('description'),
      extensions: f.stringList('extensions'),
      fileNamePattern: f.nullableString('fileNamePattern'),
      spec: f.nested('spec', ReportsRequestParser.SPEC),
    }),
  );

  private static readonly ITEM: Decoder<ImportItemRequest> = new FieldDecoder<ImportItemRequest>(
    (f: FieldReader): ImportItemRequest => ({
      fileName: f.string('fileName'),
      profileId: f.string('profileId'),
      period: f.string('period'),
      organizationId: f.string('organizationId'),
      countryId: f.string('countryId'),
      currency: f.string('currency'),
      companyId: f.string('companyId'),
      enterpriseId: f.nullableString('enterpriseId'),
      branchId: f.nullableString('branchId'),
    }),
  );

  public static profile(body: unknown): Result<ProfileRequest> {
    return ReportsRequestParser.PROFILE.decode(body);
  }

  public static manifest(raw: unknown): Result<ImportManifest> {
    let parsed: unknown = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return new FieldDecoder<ImportManifest>((f: FieldReader): ImportManifest => ({
      items: f.list('items', ReportsRequestParser.ITEM),
    })).decode(parsed);
  }
}

class NumberDecoder extends Decoder<number> {
  public override decode(value: unknown): Result<number> {
    const number: Nullable<number> = typeof value === 'number' && Number.isInteger(value) ? value : null;
    return number === null
      ? Result.fail(new ValidationError('INVALID_JSON_FIELD', 'Se esperaba un entero'))
      : Result.ok(number);
  }
}
