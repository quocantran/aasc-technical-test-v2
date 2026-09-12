import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '../services/config.service';
import { UpdateMappingDto, UpdateRulesDto } from '../dto/config.dto';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';

@ApiTags('Configuration')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('mappings')
  @ApiOperation({ summary: 'Get current TikTok to Bitrix24 field mapping configuration' })
  @ApiResponse({ status: 200, description: 'Current mapping configuration' })
  async getMappings() {
    return this.configService.getFieldMappings();
  }

  @Put('mappings')
  @ApiOperation({ summary: 'Update TikTok to Bitrix24 field mapping configuration' })
  @ApiResponse({ status: 200, description: 'Updated mapping configuration' })
  async updateMappings(@Body() body: UpdateMappingDto) {
    return this.configService.updateFieldMappings(body);
  }

  @Get('rules')
  @ApiOperation({ summary: 'Get configured deal conversion rules' })
  @ApiResponse({ status: 200, description: 'List of configured deal rules' })
  async getRules() {
    return this.configService.getDealRules();
  }

  @Put('rules')
  @ApiOperation({ summary: 'Update deal conversion rules' })
  @ApiResponse({ status: 200, description: 'Updated deal rules' })
  async updateRules(@Body() body: UpdateRulesDto) {
    return this.configService.updateDealRules(body.deal_rules);
  }
}
