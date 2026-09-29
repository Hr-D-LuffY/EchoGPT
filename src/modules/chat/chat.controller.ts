import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SseWriter } from '../../common/sse/sse-writer';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { ApiCompletionErrors } from '../providers/decorators/api-completion-errors.decorator';
import { ConsumesQuota } from '../subscriptions/decorators/consumes-quota.decorator';
import { ChatService } from './chat.service';
import { ChatDetailResponseDto } from './dto/chat-detail-response.dto';
import { ChatListResponseDto } from './dto/chat-list-response.dto';
import { SendMessageResponseDto } from './dto/send-message-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chats')
@ApiBearerAuth('access-token')
@ApiResponse({
  status: HttpStatus.UNAUTHORIZED,
  description: 'Missing or invalid access token',
})
@Controller('chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @ConsumesQuota()
  @ApiCompletionErrors()
  @ApiOperation({
    summary: 'Send a prompt and get the AI reply',
    description:
      'Starts a new conversation, or continues one when `chatId` is given (its recent messages are sent as context). Costs one request from the plan quota; failed calls are refunded.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: SendMessageResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chat not found (or not yours), or provider not enabled',
  })
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    return this.chatService.sendMessage(user.sub, dto);
  }

  @Post('messages/stream')
  @ConsumesQuota()
  @ApiCompletionErrors()
  @ApiOperation({
    summary: 'Send a prompt and stream the AI reply (Server-Sent Events)',
    description: [
      'Same body and quota rules as POST /chats/messages. Events:',
      '- `delta` — `{"content": "<next text chunk>"}`, repeated',
      '- `done` — the saved exchange, same shape as the non-streaming response',
      '- `error` — the standard error envelope, if the provider fails mid-stream',
      '',
      'Errors before the first event (validation, 404, 429, provider rejection) are normal JSON responses with their real status code.',
    ].join('\n'),
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'text/event-stream of delta* → done (or error)',
    content: {
      'text/event-stream': {
        schema: { type: 'string' },
        example: [
          'event: delta',
          'data: {"content":"REST exposes"}',
          '',
          'event: delta',
          'data: {"content":" fixed endpoints..."}',
          '',
          'event: done',
          'data: {"chatId":"cmg5a1b2c0001xyz9876abcd","title":"Compare REST and GraphQL","model":"gpt-4o-mini-2024-07-18","userMessage":{...},"assistantMessage":{...},"usage":{"promptTokens":312,"completionTokens":182,"totalTokens":494}}',
          '',
        ].join('\n'),
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chat not found (or not yours), or provider not enabled',
  })
  async streamMessage(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    const sse = new SseWriter(response);
    const events = await this.chatService.streamMessage(
      user.sub,
      dto,
      sse.signal,
    );
    await sse.pipe(events);
  }

  @Get()
  @ApiOperation({
    summary: "List the current user's conversations, most recent first",
  })
  @ApiResponse({ status: HttpStatus.OK, type: ChatListResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid page/limit',
  })
  listChats(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ): Promise<ChatListResponseDto> {
    return this.chatService.listChats(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation with its full message history' })
  @ApiResponse({ status: HttpStatus.OK, type: ChatDetailResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chat not found (or not yours)',
  })
  getChat(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ChatDetailResponseDto> {
    return this.chatService.getChat(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Chat deleted' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chat not found (or not yours)',
  })
  async deleteChat(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.chatService.deleteChat(user.sub, id);
  }
}
