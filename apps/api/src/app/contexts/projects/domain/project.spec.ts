import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';
import { EntityId, FixedClock } from '@asisteglt/shared-kernel';
import { Project } from './project';
import { ShareLink } from './share-link';

describe('Project', () => {
  const clock: FixedClock = new FixedClock(new Date('2026-03-01T10:00:00Z'));
  const owner: EntityId = EntityId.generate();
  const other: EntityId = EntityId.generate();

  it('el propietario tiene todos los permisos y no puede cambiar de rol', () => {
    const project: Project = Project.create('Reportes demo', '', ModuleType.REPORTS, owner, clock).unwrap();
    expect(project.can(owner, ProjectPermission.MEMBERS_MANAGE)).toBe(true);
    expect(project.changeRole(owner, ProjectRole.ADMIN).isOk()).toBe(false);
    expect(project.removeMember(owner).isOk()).toBe(false);
  });

  it('solo acepta roles del módulo del proyecto', () => {
    const project: Project = Project.create(
      'Inventario demo',
      '',
      ModuleType.INVENTORY,
      owner,
      clock,
    ).unwrap();
    expect(project.addMember(other, ProjectRole.DESIGNER, clock).isOk()).toBe(false);
    expect(project.addMember(other, ProjectRole.SUPERVISOR, clock).isOk()).toBe(true);
    expect(project.can(other, ProjectPermission.INVENTORY_SUPERVISE)).toBe(true);
    expect(project.can(other, ProjectPermission.MEMBERS_MANAGE)).toBe(false);
    expect(project.addMember(other, ProjectRole.COUNTER, clock).isOk()).toBe(false);
  });

  it('un vínculo expira por fecha y por número de usos', () => {
    const link: ShareLink = ShareLink.create(
      EntityId.generate(),
      'h',
      ProjectRole.VIEWER,
      1,
      2,
      owner,
      clock,
    );
    expect(link.isUsable(clock)).toBe(true);
    link.registerUse();
    link.registerUse();
    expect(link.isUsable(clock)).toBe(false);
    const later: FixedClock = new FixedClock(new Date('2026-03-03T10:00:00Z'));
    expect(
      ShareLink.create(EntityId.generate(), 'h', ProjectRole.VIEWER, 1, null, owner, clock).isUsable(later),
    ).toBe(false);
  });
});
