import { Command, CommandRunner, Option } from 'nest-commander';
import { SyncOrchestratorService } from '../services/sync-orchestrator.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';

// CLI options accepted by the sync command
interface SyncCommandOptions {
  force?: boolean;
}

// Command runner enabling manual synchronization via command-line interface
@Command({ name: 'sync', description: 'Run Google Sheets to Bitrix24 sync pipeline' })
export class SyncCommand extends CommandRunner {
  constructor(
    private readonly orchestrator: SyncOrchestratorService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  // Executes synchronization pipeline and reports status or exits with error code
  async run(passedParams: string[], options?: SyncCommandOptions): Promise<void> {
    const isForce = options?.force === true;
    this.logger.log(`Starting CLI sync execution (force: ${isForce})`, 'SyncCommand');

    try {
      const result = await this.orchestrator.runSync({ force: isForce });
      if (result.isSkippedDueToLock) {
        this.logger.warn('Sync aborted because another sync process is running.', 'SyncCommand');
      }
    } catch (error: any) {
      this.logger.error(`CLI sync terminated with error: ${error.message}`, error.stack, 'SyncCommand');
      process.exit(1);
    }
  }

  // Parses optional -f or --force flag to bypass hash comparison
  @Option({
    flags: '-f, --force',
    description: 'Force re-synchronization of all rows regardless of hash matching',
  })
  parseForce(): boolean {
    return true;
  }
}
