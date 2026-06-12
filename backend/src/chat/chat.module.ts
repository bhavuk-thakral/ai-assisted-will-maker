import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { WillModule } from '../will/will.module';

@Module({
  imports: [WillModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
