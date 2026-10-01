import { ImportItemRequest, ImportManifest, ProfileRequest } from '@asisteglt/shared-contracts';
import { SpecDecoders } from '@asisteglt/shared-ingestion-core';
import { Decoder, FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';

/** Valida los cuerpos JSON anidados (preconfiguraciones y manifiestos de carga) recibidos como `unknown`. */
export class ReportsRequestParser {
  private static readonly PROFILE: Decoder<ProfileRequest> = new FieldDecoder<ProfileRequest>(
    (f: FieldReader): ProfileRequest => ({
      name: f.string('name'),
      description: f.string('description'),
      extensions: f.stringList('extensions'),
      fileNamePattern: f.nullableString('fileNamePattern'),
      spec: f.nested('spec', SpecDecoders.SPEC),
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
