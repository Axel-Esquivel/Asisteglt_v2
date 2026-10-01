import { DynamicModule, Module } from '@nestjs/common';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { ChatService } from './application/chat.service';
import {
  ConversationRepository,
  MessageRepository,
  PresenceTracker,
  ReadMarkerRepository,
  RealtimeEventPublisher,
} from './domain/ports';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemoryReadMarkerRepository,
} from './infrastructure/memory/in-memory-chat.repositories';
import {
  MongoConversationRepository,
  MongoMessageRepository,
  MongoReadMarkerRepository,
} from './infrastructure/mongo/mongo-chat.repositories';
import { InMemoryPresenceTracker } from './infrastructure/realtime/in-memory-presence.tracker';
import { RealtimeGateway } from './infrastructure/realtime/realtime.gateway';
import { ChatController } from './presentation/chat.controller';

/** Chat global, directo y por proyecto, con presencia y eventos Socket.IO. Exporta el publicador. */
@Module({})
export class ChatModule {
  public static register(store: DataStore): DynamicModule {
    return {
      module: ChatModule,
      global: true,
      controllers: [ChatController],
      providers: [
        RepositoryBinding.bind(
          ConversationRepository,
          store,
          InMemoryConversationRepository,
          MongoConversationRepository,
        ),
        RepositoryBinding.bind(MessageRepository, store, InMemoryMessageRepository, MongoMessageRepository),
        RepositoryBinding.bind(
          ReadMarkerRepository,
          store,
          InMemoryReadMarkerRepository,
          MongoReadMarkerRepository,
        ),
        { provide: PresenceTracker, useClass: InMemoryPresenceTracker },
        RealtimeGateway,
        { provide: RealtimeEventPublisher, useExisting: RealtimeGateway },
        ChatService,
      ],
      exports: [RealtimeEventPublisher, PresenceTracker],
    };
  }
}
