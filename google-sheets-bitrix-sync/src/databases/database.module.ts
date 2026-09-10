import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import path from 'path';
import fs from 'fs';

// Configures TypeORM with SQLite storage for persistent OAuth tokens and execution history
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbPath = configService.get<string>('app.databasePath') || process.env.DATABASE_PATH || 'data/database.sqlite';
        const resolvedPath = path.resolve(process.cwd(), dbPath);
        const dir = path.dirname(resolvedPath);

        // Ensures database directory exists before connecting
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        return {
          type: 'sqlite',
          database: resolvedPath,
          autoLoadEntities: true,
          synchronize: true,
          logging:
            configService.get<string>('app.nodeEnv') === 'development'
              ? ['error', 'warn']
              : false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
