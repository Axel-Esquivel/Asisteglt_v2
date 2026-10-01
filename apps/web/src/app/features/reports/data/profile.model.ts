import { FixedWidthSpec, ProfileResponse, ProfileStatus, SourceType } from '@asisteglt/shared-contracts';
import { SpecDecoders } from '@asisteglt/shared-ingestion-core';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';
import { ReportsLabels } from './reports-labels';

export class ProfileView {
  public constructor(public readonly s: ProfileResponse) {}

  public static decoder(): FieldDecoder<ProfileView> {
    return new FieldDecoder<ProfileView>(
      (f: FieldReader): ProfileView =>
        new ProfileView({
          id: f.string('id'),
          name: f.string('name'),
          description: f.string('description'),
          sourceType: f.oneOf('sourceType', Object.values(SourceType)),
          extensions: f.stringList('extensions'),
          fileNamePattern: f.nullableString('fileNamePattern'),
          status: f.oneOf('status', Object.values(ProfileStatus)),
          version: f.number('version'),
          spec: f.nested('spec', SpecDecoders.SPEC),
          updatedAt: f.string('updatedAt'),
        }),
    );
  }

  public get id(): string {
    return this.s.id;
  }

  public get name(): string {
    return this.s.name;
  }

  public get spec(): FixedWidthSpec {
    return this.s.spec;
  }

  public isActive(): boolean {
    return this.s.status === ProfileStatus.ACTIVE;
  }

  public status(): {
    readonly label: string;
    readonly severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  } {
    return ReportsLabels.profileStatus(this.s.status);
  }

  public accepts(fileName: string): boolean {
    const lower: string = fileName.toLocaleLowerCase();
    return this.s.extensions.some((ext: string): boolean => lower.endsWith(ext));
  }

  public matchesPattern(fileName: string): boolean {
    const pattern: Nullable<string> = this.s.fileNamePattern;
    if (pattern === null) {
      return false;
    }
    const source: string = pattern
      .split('')
      .map((c: string): string =>
        c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    return new RegExp(`^${source}$`, 'i').test(fileName);
  }
}
