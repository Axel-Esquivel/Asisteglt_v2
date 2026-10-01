import {
  ClassificationNodeDto,
  ClassificationRequest,
  ReportDefinitionRequest,
  RowSource,
} from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';

/** Validación de los cuerpos JSON de clasificaciones e informes (compartible con el navegador). */
export class AnalysisParsers {
  public static readonly NODE: Decoder<ClassificationNodeDto> = new FieldDecoder<ClassificationNodeDto>(
    (f: FieldReader): ClassificationNodeDto => ({
      id: f.string('id'),
      parentId: f.nullableString('parentId'),
      code: f.string('code'),
      name: f.string('name'),
      patterns: f.stringList('patterns'),
    }),
  );

  private static readonly CLASSIFICATION: Decoder<ClassificationRequest> =
    new FieldDecoder<ClassificationRequest>((f: FieldReader): ClassificationRequest => ({
      name: f.string('name'),
      fieldKey: f.string('fieldKey'),
      nodes: f.list('nodes', AnalysisParsers.NODE),
    }));

  private static readonly REPORT: Decoder<ReportDefinitionRequest> =
    new FieldDecoder<ReportDefinitionRequest>((f: FieldReader): ReportDefinitionRequest => ({
      name: f.string('name'),
      rowSource: f.oneOf('rowSource', Object.values(RowSource)),
      classificationId: f.nullableString('classificationId'),
      rowFieldKey: f.nullableString('rowFieldKey'),
      measures: f.stringList('measures'),
      profileId: f.nullableString('profileId'),
      companyId: f.nullableString('companyId'),
      onlyWhenFieldKey: f.nullableString('onlyWhenFieldKey'),
      includeUnclassified: f.boolean('includeUnclassified'),
    }));

  public static classification(body: unknown): Result<ClassificationRequest> {
    return AnalysisParsers.CLASSIFICATION.decode(body);
  }

  public static report(body: unknown): Result<ReportDefinitionRequest> {
    return AnalysisParsers.REPORT.decode(body);
  }
}
