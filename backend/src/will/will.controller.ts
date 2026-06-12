import { Controller, Get, Param, UseGuards, Request, Header } from '@nestjs/common';
import { WillService } from './will.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('will')
export class WillController {
  constructor(private readonly willService: WillService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyWill(@Request() req: any) {
    return this.willService.getWillByUserId(req.user.userId);
  }

  @Get(':id/validate')
  @UseGuards(JwtAuthGuard)
  async validateWill(@Param('id') id: string, @Request() req: any) {
    return this.willService.validateWill(parseInt(id, 10), req.user.userId);
  }

  // No JWT guard here — document is opened directly in a new browser tab
  // (cannot send Authorization headers via <a href> links)
  @Get(':id/document')
  @Header('Content-Type', 'text/html')
  async getWillDocument(@Param('id') id: string) {
    return this.willService.generateHtmlDocument(parseInt(id, 10));
  }
}
