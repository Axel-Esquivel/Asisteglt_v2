import { DynamicModule, Module } from '@nestjs/common';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { ProjectAccess } from './application/project-access';
import { ProjectService } from './application/project.service';
import { ProjectRepository, ShareLinkRepository } from './domain/ports';
import {
  InMemoryProjectRepository,
  InMemoryShareLinkRepository,
} from './infrastructure/memory/in-memory-projects.repositories';
import {
  MongoProjectRepository,
  MongoShareLinkRepository,
} from './infrastructure/mongo/mongo-projects.repositories';
import { ProjectsController } from './presentation/projects.controller';

/** Contexto de proyectos: miembros, roles y vínculos para compartir. Exporta `ProjectAccess`. */
@Module({})
export class ProjectsModule {
  public static register(store: DataStore): DynamicModule {
    return {
      module: ProjectsModule,
      global: true,
      controllers: [ProjectsController],
      providers: [
        RepositoryBinding.bind(ProjectRepository, store, InMemoryProjectRepository, MongoProjectRepository),
        RepositoryBinding.bind(
          ShareLinkRepository,
          store,
          InMemoryShareLinkRepository,
          MongoShareLinkRepository,
        ),
        ProjectAccess,
        ProjectService,
      ],
      exports: [ProjectAccess, ProjectRepository, ProjectService],
    };
  }
}
