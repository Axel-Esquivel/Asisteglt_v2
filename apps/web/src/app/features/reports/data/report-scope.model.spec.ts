import { OrgLevel } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { OrgTree, OrgUnitView } from './org.model';
import { ReportScope } from './report-scope.model';
import { Option } from './reports-labels';

/** Estructura FICTICIA: dos organizaciones con un país y una compañía cada una. */
const unit = (id: string, level: OrgLevel, parentId: Nullable<string>): OrgUnitView =>
  new OrgUnitView({
    id,
    level,
    parentId,
    code: id,
    name: id,
    currencies: level === OrgLevel.COUNTRY ? ['GTQ'] : [],
  });

const tree: OrgTree = new OrgTree([
  unit('org1', OrgLevel.ORGANIZATION, null),
  unit('org2', OrgLevel.ORGANIZATION, null),
  unit('gt1', OrgLevel.COUNTRY, 'org1'),
  unit('gt2', OrgLevel.COUNTRY, 'org2'),
  unit('a', OrgLevel.COMPANY, 'gt1'),
  unit('b', OrgLevel.COMPANY, 'gt2'),
]);

const values = (options: Option<string>[]): string[] => options.map((o: Option<string>): string => o.value);

describe('ReportScope', () => {
  it('limita las compañías por la organización elegida aunque no se elija país', () => {
    const scope: ReportScope = ReportScope.empty();
    expect(values(scope.options(tree, OrgLevel.COMPANY))).toEqual(['a', 'b']);
    scope.organizationIds = ['org1'];
    expect(values(scope.options(tree, OrgLevel.COMPANY))).toEqual(['a']);
  });

  it('viaja en la URL y se recupera igual', () => {
    const scope: ReportScope = new ReportScope(['org1'], [], ['GTQ'], ['a'], [], []);
    const query: Record<string, string> = scope.toQuery();
    expect(query).toEqual({ scope: 'chosen', organizationIds: 'org1', currencies: 'GTQ', companyIds: 'a' });
    const params: Map<string, string> = new Map<string, string>(Object.entries(query));
    const back: Nullable<ReportScope> = ReportScope.fromQuery({
      get: (key: string): Nullable<string> => params.get(key) ?? null,
      getAll: (): string[] => [],
      has: (key: string): boolean => params.has(key),
      keys: [...params.keys()],
    });
    expect(back).toEqual(scope);
  });
});
