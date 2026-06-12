import { Controller, Post, Get, Body, Request, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WillService } from '../will/will.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly willService: WillService,
  ) {}

  @Post()
  async sendMessage(@Body() body: any, @Request() req: any) {
    return this.chatService.sendMessage(req.user.userId, body.message);
  }

  @Get('history')
  async getHistory(@Request() req: any) {
    const will = await this.willService.getWillByUserId(req.user.userId);
    const history = await this.chatService.getChatHistory(will.id);
    return {
      history,
      will,
    };
  }
}
