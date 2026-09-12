import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { LeadService } from '../services/lead.service';
import { BatchMigrationService } from '../services/batch-migration.service';
import { LeadQueryDto } from '../dto/lead-query.dto';
import { BatchMigrateDto } from '../dto/batch-migrate.dto';
import { ConvertLeadDto } from '../../deal/dto/convert-lead.dto';
import { DealConversionService } from '../../deal/services/deal-conversion.service';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';

@ApiTags('Leads')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('leads')
export class LeadController {
  constructor(
    private readonly leadService: LeadService,
    private readonly batchMigrationService: BatchMigrationService,
    private readonly dealConversionService: DealConversionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of leads with filters' })
  @ApiResponse({ status: 200, description: 'Paginated lead results' })
  async getLeads(@Query() query: LeadQueryDto) {
    return this.leadService.findPaginated(query);
  }

  @Post('batch-migrate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger asynchronous batch migration of historical leads into Bitrix24' })
  @ApiResponse({ status: 202, description: 'Batch migration job accepted and enqueued' })
  async batchMigrate(@Body() dto: BatchMigrateDto) {
    return this.batchMigrationService.startBatchMigration(dto);
  }

  @Get('batch-migrate/:jobId')
  @ApiOperation({ summary: 'Get status and metrics of a historical batch migration job' })
  @ApiResponse({ status: 200, description: 'Migration job status details' })
  async getMigrationStatus(@Param('jobId') jobId: string) {
    return this.batchMigrationService.getJobStatus(jobId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific lead by ID' })
  @ApiResponse({ status: 200, description: 'Lead details' })
  async getLeadById(@Param('id') id: string) {
    return this.leadService.findById(id);
  }

  @Post(':id/convert-to-deal')
  @ApiOperation({ summary: 'Manually convert a lead into a Bitrix24 CRM Deal' })
  @ApiResponse({ status: 200, description: 'Lead converted into deal' })
  async convertToDeal(
    @Param('id') id: string,
    @Body() convertDto: ConvertLeadDto,
  ) {
    return this.dealConversionService.convertLeadToDeal(id, convertDto);
  }
}

