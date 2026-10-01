import { ServiceStatus } from '@asisteglt/shared-contracts';
import { Decoder, JsonReader, Result, ValidationError } from '@asisteglt/shared-kernel';
import { ServiceHealth } from './service-health';

/** Decodifica `HealthResponse` (contrato compartido) en `ServiceHealth`. */
export class ServiceHealthDecoder extends Decoder<ServiceHealth> {
  public override decode(value: unknown): Result<ServiceHealth> {
    return JsonReader.from(value).flatMap((json: JsonReader): Result<ServiceHealth> => {
      const fields: Result<ReadonlyArray<string | number>> = Result.all<string | number>([
        json.string('service'),
        json.oneOf('status', Object.values(ServiceStatus)),
        json.string('version'),
        json.string('environment'),
        json.number('uptimeSeconds'),
        json.string('timestamp'),
      ]);
      return fields.flatMap((): Result<ServiceHealth> => {
        const checkedAt: Date = new Date(json.string('timestamp').unwrap());
        if (Number.isNaN(checkedAt.getTime())) {
          return Result.fail(
            new ValidationError('INVALID_JSON_FIELD', 'El campo «timestamp» no es una fecha válida'),
          );
        }
        return Result.ok(
          new ServiceHealth(
            json.string('service').unwrap(),
            json.oneOf('status', Object.values(ServiceStatus)).unwrap(),
            json.string('version').unwrap(),
            json.string('environment').unwrap(),
            json.number('uptimeSeconds').unwrap(),
            checkedAt,
          ),
        );
      });
    });
  }
}
