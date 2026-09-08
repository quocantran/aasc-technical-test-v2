import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';

// Bootstraps CLI application using nest-commander for standalone terminal execution
async function bootstrap() {
  await CommandFactory.run(AppModule, ['warn', 'error']);
}

bootstrap();
