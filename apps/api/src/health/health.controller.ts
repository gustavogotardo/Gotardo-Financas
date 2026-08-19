import { Controller, Get } from '@nestjs/common';
import type { ApiEnvelope } from '@gotardo/shared';
import { Public } from '../common/decorators/public.decorator';

type HealthResponse = {
  status: 'ok';
  service: string;
  version: string;
  uptime: number;
};

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): ApiEnvelope<HealthResponse> {
    return {
      data: {
        status: 'ok',
        service: 'gotardo-api',
        version: '0.1.0',
        uptime: Math.round(process.uptime()),
      },
    };
  }
}
