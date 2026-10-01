import { AggregateRoot } from './aggregate-root';
import { DomainEvent } from './domain-event';
import { EntityId } from './entity-id';

class SampleCreated extends DomainEvent {
  public constructor(id: EntityId) {
    super(id, new Date('2026-10-01T00:00:00Z'));
  }

  public override eventName(): string {
    return 'sample.created';
  }
}

class Sample extends AggregateRoot {
  public static create(): Sample {
    const sample: Sample = new Sample(EntityId.generate());
    sample.record(new SampleCreated(sample.getId()));
    return sample;
  }
}

describe('EntityId y AggregateRoot', () => {
  it('genera y valida identificadores', () => {
    const id: EntityId = EntityId.generate();
    expect(EntityId.fromString(id.toString()).unwrap().equals(id)).toBe(true);
    expect(EntityId.fromString('66f7c0c2a1b2c3d4e5f60718').isOk()).toBe(true);
    expect(EntityId.fromString('no-es-id').isOk()).toBe(false);
  });

  it('entrega los eventos pendientes una sola vez', () => {
    const sample: Sample = Sample.create();
    expect(sample.pullDomainEvents().map((e: DomainEvent): string => e.eventName())).toEqual([
      'sample.created',
    ]);
    expect(sample.pullDomainEvents()).toEqual([]);
  });
});

describe('Email', () => {
  it('normaliza y valida', async (): Promise<void> => {
    const { Email } = await import('../values/email');
    expect(Email.create('  Ana@Demo.COM ').unwrap().toString()).toBe('ana@demo.com');
    expect(Email.create('sin-arroba').isOk()).toBe(false);
  });
});
