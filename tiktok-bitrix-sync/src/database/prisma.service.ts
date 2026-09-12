import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.logger.log('Connecting to PostgreSQL via Prisma...', 'PrismaService');
    await this.$connect();
    this.logger.log('PostgreSQL connected successfully.', 'PrismaService');
  }

  async onModuleDestroy() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.logger.log('Disconnecting from PostgreSQL...', 'PrismaService');
    await this.$disconnect();
  }

}
