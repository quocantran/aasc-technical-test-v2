import { Controller, Get, Post, Body, Header, HttpCode, HttpStatus } from '@nestjs/common';
import fs from 'fs';
import { join } from 'path';
import { SyncOrchestratorService } from '../sync/services/sync-orchestrator.service.js';
import { MappingService } from '../mapping/services/mapping.service.js';
import { LockService } from '../sync/services/lock.service.js';
import { BitrixLeadService } from '../bitrix/services/bitrix-lead.service.js';
import type { MappingConfiguration } from '../mapping/interfaces/mapping-config.interface.js';

// Web management admin interface and configuration REST APIs
@Controller()
export class AdminController {
  constructor(
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly mappingService: MappingService,
    private readonly lockService: LockService,
    private readonly bitrixLeadService: BitrixLeadService,
  ) {}

  // Returns available Bitrix24 Lead fields for non-tech admin selection
  @Get('api/bitrix/lead-fields')
  async getBitrixLeadFields() {
    const fields = await this.bitrixLeadService.getLeadFields();
    return {
      status: 'success',
      data: fields,
    };
  }

  // Returns active field mapping rules configuration
  @Get('api/mapping')
  getMapping() {
    return {
      status: 'success',
      data: this.mappingService.getMappingConfig(),
    };
  }

  // Updates mapping rules configuration and saves to disk
  @Post('api/mapping')
  @HttpCode(HttpStatus.OK)
  updateMapping(@Body() body: Record<string, any>) {
    this.mappingService.saveMappingConfig(body as MappingConfiguration);
    return {
      status: 'success',
      message: 'Cập nhật cấu hình mapping thành công',
      data: this.mappingService.getMappingConfig(),
    };
  }

  // Returns execution logs and historical sync statistics
  @Get('api/sync/logs')
  getLogs() {
    return {
      status: 'success',
      data: this.syncOrchestrator.getRecentLogs(),
    };
  }

  // Triggers manual reverse synchronization (Bitrix24 -> Google Sheets)
  @Post('api/sync/two-way')
  @HttpCode(HttpStatus.OK)
  async triggerTwoWaySync() {
    let attempts = 0;
    while (this.lockService.isLocked() && attempts < 6) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (this.lockService.isLocked()) {
      return {
        status: 'warning',
        message: 'Đang có một tiến trình đồng bộ đang chạy, vui lòng thử lại sau',
        isSkippedDueToLock: true,
        data: {
          isSkippedDueToLock: true,
          totalRows: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          durationMs: 0,
          timestamp: new Date().toISOString(),
          direction: 'BITRIX_TO_SHEETS',
        },
      };
    }

    const result = await this.syncOrchestrator.syncBitrixToSheets();
    return {
      status: 'success',
      message: 'Đồng bộ 2 chiều (Bitrix24 -> Google Sheets) hoàn tất',
      data: result,
    };
  }

  // Serves visual management dashboard from public/index.html
  @Get('admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getAdminDashboard(): string {
    const indexPath = join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      return fs.readFileSync(indexPath, 'utf-8');
    }
    return `<!DOCTYPE html><html><head><title>Admin</title></head><body><h1>Quản Trị Đồng Bộ Google Sheets ↔ Bitrix24</h1><p>Vui lòng kiểm tra thư mục public/index.html</p></body></html>`;
  }
}
