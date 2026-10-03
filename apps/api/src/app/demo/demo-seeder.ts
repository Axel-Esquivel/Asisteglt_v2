import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  AssignmentMode,
  CatalogTemplate,
  DataType,
  DerivedAttributeKind,
  FieldRole,
  FixedWidthSpec,
  ImportItemRequest,
  InventoryItemRequest,
  ModuleType,
  NumericNature,
  OrgLevel,
  ParticipantDto,
  ParticipantRole,
  ProjectRole,
  RowSource,
  ToleranceKind,
} from '@asisteglt/shared-contracts';
import {
  ColumnDefaults,
  PageHeaderBlockRule,
  SkipBlankLinesRule,
  SkipPageBreaksRule,
  TextDocument,
  TextEncoding,
  TextLine,
} from '@asisteglt/shared-ingestion-core';
import { EntityId, Nullable, Result } from '@asisteglt/shared-kernel';
import { AppConfig } from '../config/app-config';
import { RegisterCommand } from '../contexts/iam/application/commands';
import { RegisterUserUseCase } from '../contexts/iam/application/auth.use-cases';
import { IssuedSession } from '../contexts/iam/application/session-issuer';
import { DeviceInfo } from '../contexts/iam/domain/session';
import { InventoryService } from '../contexts/inventory/application/inventory.service';
import { ProjectService } from '../contexts/projects/application/project.service';
import { Project } from '../contexts/projects/domain/project';
import { AnalysisService } from '../contexts/reports/application/analysis.service';
import { CatalogService } from '../contexts/reports/application/catalog.service';
import { ImportService, UploadedContent } from '../contexts/reports/application/import.service';
import { OrgStructureService } from '../contexts/reports/application/org-structure.service';
import { ProfileService } from '../contexts/reports/application/profile.service';
import { CatalogField, FieldCatalog } from '../contexts/reports/domain/field-catalog';
import { DataSourceProfile } from '../contexts/reports/domain/data-source-profile';
import { OrgUnitSnapshot } from '../contexts/reports/domain/org-structure';
import { ImportQueue } from '../contexts/reports/domain/ports';
import { DemoData } from './demo-data';

/**
 * Crea datos de demostración FICTICIOS al arrancar con `DEMO_SEED=true`: usuarios, un proyecto
 * de Reportes con datos cargados, clasificación e informes, y un proyecto de Inventarios con una
 * toma en curso. Si el usuario administrador ya existe, no hace nada.
 */
@Injectable()
export class DemoSeeder implements OnApplicationBootstrap {
  private readonly logger: Logger = new Logger(DemoSeeder.name);
  private readonly device: DeviceInfo = new DeviceInfo('demo-seeder', '127.0.0.1');

  public constructor(
    private readonly config: AppConfig,
    private readonly register: RegisterUserUseCase,
    private readonly projects: ProjectService,
    private readonly org: OrgStructureService,
    private readonly catalogs: CatalogService,
    private readonly profiles: ProfileService,
    private readonly imports: ImportService,
    private readonly queue: ImportQueue,
    private readonly analysis: AnalysisService,
    private readonly inventory: InventoryService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.config.demoSeed) {
      return;
    }
    try {
      await this.seed();
    } catch (error: unknown) {
      this.logger.error(
        `No se pudieron crear los datos de demostración: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async seed(): Promise<void> {
    const users: EntityId[] = [];
    for (const user of DemoData.USERS) {
      const session: Result<IssuedSession> = await this.register.execute(
        new RegisterCommand(user.email, DemoData.PASSWORD, user.name),
        this.device,
      );
      if (!session.isOk()) {
        this.logger.log('Los datos de demostración ya existen; se omite la siembra');
        return;
      }
      users.push(session.unwrap().user.getId());
    }
    const admin: Nullable<EntityId> = users[0] ?? null;
    if (admin === null) {
      return;
    }
    await this.seedReports(admin);
    await this.seedInventory(admin);
    this.logger.log(
      `Datos de demostración listos. Usuarios *@demo.asisteglt.local, contraseña ${DemoData.PASSWORD}`,
    );
  }

  private async seedReports(admin: EntityId): Promise<void> {
    const project: Project = (
      await this.projects.create(
        admin,
        'Demo · Balance ficticio',
        'Proyecto de demostración con datos ficticios',
        ModuleType.REPORTS,
      )
    ).unwrap();
    const projectId: string = project.getId().toString();
    await this.projects.addMember(projectId, admin, 'analista@demo.asisteglt.local', ProjectRole.ANALYST);
    const unit = async (
      level: OrgLevel,
      parentId: Nullable<string>,
      code: string,
      name: string,
      currencies: string[],
    ): Promise<string> =>
      (await this.org.add(projectId, admin, { level, parentId, code, name, currencies }))
        .map((u: OrgUnitSnapshot): string => u.id)
        .unwrap();
    const organizationId: string = await unit(OrgLevel.ORGANIZATION, null, 'GRP', 'Grupo Demo', []);
    const countryId: string = await unit(OrgLevel.COUNTRY, organizationId, 'GT', 'Guatemala', ['GTQ', 'USD']);
    const companyA: string = await unit(OrgLevel.COMPANY, countryId, 'DEMO-A', 'Demo A, S.A.', []);
    await unit(OrgLevel.COMPANY, countryId, 'DEMO-B', 'Demo B, S.A.', []);
    (await this.catalogs.applyTemplate(projectId, admin, CatalogTemplate.ACCOUNTING)).unwrap();
    const catalog: FieldCatalog = await this.catalogs.of(project.getId());
    const key = (label: string): string => {
      const field: Nullable<CatalogField> =
        catalog.all().find((f: CatalogField): boolean => f.label === label) ?? null;
      return field === null ? '' : field.key;
    };
    const sample: TextDocument = TextDocument.fromText(
      DemoData.balance('08', '5,200.00'),
      TextEncoding.UTF8,
      8,
    );
    const header: TextLine[] = sample
      .all()
      .slice(0, 3)
      .map((l: TextLine): TextLine => l);
    const spec: FixedWidthSpec = {
      encoding: 'auto',
      tabSize: 8,
      lineLength: sample.maxLineLength(),
      dividers: [17, 47, 58, 69],
      rowRules: [
        new SkipBlankLinesRule().toSpec(),
        new SkipPageBreaksRule().toSpec(),
        PageHeaderBlockRule.fromLines(header).toSpec(),
      ],
      masks: [{ fieldKey: key('Código de cuenta'), pattern: '9.999.999.9999' }],
      columns: [
        ColumnDefaults.create(0, key('Código de cuenta'), FieldRole.IDENTIFIER, DataType.TEXT, null),
        ColumnDefaults.create(1, key('Nombre de cuenta'), FieldRole.IDENTIFIER_NAME, DataType.TEXT, null),
        ColumnDefaults.create(
          2,
          key('Saldo anterior'),
          FieldRole.DATA,
          DataType.DECIMAL,
          NumericNature.AMOUNT,
        ),
        ColumnDefaults.create(3, key('Debe'), FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
        ColumnDefaults.create(4, key('Haber'), FieldRole.DATA, DataType.DECIMAL, NumericNature.AMOUNT),
      ],
      derived: [
        {
          kind: DerivedAttributeKind.LEAF_FLAG,
          sourceKey: key('Código de cuenta'),
          targetKey: key('Es cuenta de detalle'),
          separator: '.',
          spacesPerLevel: 3,
        },
        {
          kind: DerivedAttributeKind.CODE_SEGMENTS_LEVEL,
          sourceKey: key('Código de cuenta'),
          targetKey: key('Nivel de cuenta'),
          separator: '.',
          spacesPerLevel: 3,
        },
      ],
    };
    const profile: DataSourceProfile = (
      await this.profiles.create(projectId, admin, {
        name: 'balancetxt',
        description: 'Balance de saldos mensual (demostración)',
        extensions: ['.txt', '.prn'],
        fileNamePattern: 'balance_*.txt',
        spec,
      })
    ).unwrap();
    (await this.profiles.activate(projectId, admin, profile.getId().toString())).unwrap();
    const item = (period: string, fileName: string): ImportItemRequest => ({
      fileName,
      profileId: profile.getId().toString(),
      period,
      organizationId,
      countryId,
      currency: 'GTQ',
      companyId: companyA,
      enterpriseId: null,
      branchId: null,
    });
    const encoder: TextEncoder = new TextEncoder();
    (
      await this.imports.submit(
        projectId,
        admin,
        { items: [item('2026-07', 'balance_demo_2026_07.txt'), item('2026-08', 'balance_demo_2026_08.txt')] },
        [
          new UploadedContent('balance_demo_2026_07.txt', encoder.encode(DemoData.balance('07', '4,350.00'))),
          new UploadedContent('balance_demo_2026_08.txt', encoder.encode(DemoData.balance('08', '5,200.00'))),
        ],
      )
    ).unwrap();
    await this.queue.idle();
    const classification = (
      await this.analysis.saveClassification(projectId, admin, null, {
        name: 'Balance general',
        fieldKey: key('Código de cuenta'),
        nodes: [
          { id: 'activo', parentId: null, code: '1', name: 'Activo', patterns: ['1.*'] },
          { id: 'caja', parentId: 'activo', code: '1.1', name: 'Caja y bancos', patterns: ['1.001.001.*'] },
          { id: 'pasivo', parentId: null, code: '2', name: 'Pasivo', patterns: ['2.*'] },
          { id: 'ingresos', parentId: null, code: '4', name: 'Ingresos', patterns: ['4.*'] },
        ],
      })
    ).unwrap();
    (
      await this.analysis.saveReport(projectId, admin, null, {
        name: 'Balance por clasificación (solo detalle)',
        rowSource: RowSource.CLASSIFICATION,
        classificationId: classification.getId().toString(),
        rowFieldKey: null,
        measures: [key('Saldo anterior'), key('Debe'), key('Haber')],
        profileId: null,
        companyId: null,
        onlyWhenFieldKey: key('Es cuenta de detalle'),
        includeUnclassified: true,
        formulaColumns: [],
      })
    ).unwrap();
  }

  private async seedInventory(admin: EntityId): Promise<void> {
    const project: Project = (
      await this.projects.create(
        admin,
        'Demo · Bodega ficticia',
        'Toma física de demostración',
        ModuleType.INVENTORY,
      )
    ).unwrap();
    const projectId: string = project.getId().toString();
    const counters: EntityId[] = [];
    for (const user of DemoData.USERS.slice(2)) {
      const updated: Project = (
        await this.projects.addMember(projectId, admin, user.email, ProjectRole.COUNTER)
      ).unwrap();
      const member =
        updated
          .getMembers()
          .find(
            (m) =>
              !counters.some((c: EntityId): boolean => c.equals(m.userId)) && m.role === ProjectRole.COUNTER,
          ) ?? null;
      if (member !== null) {
        counters.push(member.userId);
      }
    }
    const count = (
      await this.inventory.create(projectId, admin, {
        name: 'Toma de demostración',
        warehouse: 'Bodega central',
        toleranceKind: ToleranceKind.ABSOLUTE,
        toleranceValue: '1',
        maxRounds: 3,
      })
    ).unwrap();
    (
      await this.inventory.replaceItems(
        projectId,
        admin,
        count.id,
        DemoData.ITEMS.map(([sku, description, location, quantity, cost]): InventoryItemRequest => ({
          sku,
          description,
          unit: 'u',
          location,
          expectedQuantity: quantity,
          unitCost: cost,
          x: null,
          y: null,
        })),
      )
    ).unwrap();
    (
      await this.inventory.setParticipants(projectId, admin, count.id, [
        ...counters.map((c: EntityId): ParticipantDto => ({
          userId: c.toString(),
          role: ParticipantRole.COUNTER,
        })),
        { userId: admin.toString(), role: ParticipantRole.SUPERVISOR },
      ])
    ).unwrap();
    (
      await this.inventory.start(projectId, admin, count.id, { mode: AssignmentMode.ZONES, ranges: [] })
    ).unwrap();
  }
}
