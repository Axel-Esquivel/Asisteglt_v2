import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ChatMessageResponse, ConversationResponse, PresenceResponse } from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../../iam/domain/ports';
import { ChatService, ConversationView } from '../application/chat.service';
import { PresenceTracker } from '../domain/ports';
import { OpenDirectRequestDto, PostMessageRequestDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  public constructor(
    private readonly chat: ChatService,
    private readonly presence: PresenceTracker,
  ) {}

  @Get('conversations')
  public async conversations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ConversationResponse[]> {
    return (await this.chat.list(principal.userId)).map(ChatController.conversation);
  }

  @Post('direct')
  public async openDirect(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: OpenDirectRequestDto,
  ): Promise<ConversationResponse> {
    return ChatController.conversation((await this.chat.openDirect(principal.userId, body.userId)).unwrap());
  }

  @Get('projects/:projectId')
  public async forProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ): Promise<ConversationResponse> {
    return ChatController.conversation((await this.chat.forProject(principal.userId, projectId)).unwrap());
  }

  @Get('conversations/:id/messages')
  public async history(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Query('before') before: string,
  ): Promise<ChatMessageResponse[]> {
    return (await this.chat.history(principal.userId, id, ChatController.date(before))).unwrap();
  }

  @Post('conversations/:id/messages')
  public async post(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() body: PostMessageRequestDto,
  ): Promise<ChatMessageResponse> {
    return (await this.chat.post(principal.userId, id, body.text)).unwrap();
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    (await this.chat.markRead(principal.userId, id)).unwrap();
  }

  @Patch('messages/:id')
  public async edit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() body: PostMessageRequestDto,
  ): Promise<ChatMessageResponse> {
    return (await this.chat.edit(principal.userId, id, body.text)).unwrap();
  }

  @Delete('messages/:id')
  public async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<ChatMessageResponse> {
    return (await this.chat.remove(principal.userId, id)).unwrap();
  }

  @Get('presence')
  public async online(): Promise<PresenceResponse> {
    return { online: await this.presence.onlineUsers() };
  }

  private static conversation(view: ConversationView): ConversationResponse {
    const s = view.conversation.toSnapshot();
    return {
      id: s.id,
      type: s.type,
      title: view.title,
      projectId: s.projectId,
      counterpartId: view.counterpartId,
      lastMessageAt: s.lastMessageAt === null ? null : s.lastMessageAt.toISOString(),
      unread: view.unread,
    };
  }

  private static date(raw: unknown): Nullable<Date> {
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    const date: Date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
