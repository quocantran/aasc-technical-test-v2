import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { DealService } from '../services/deal.service';
import { DealQueryDto } from '../dto/deal-query.dto';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';

@ApiTags('Deals')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('deals')
export class DealController {
  constructor(private readonly dealService: DealService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of deals filtered by status or assigned user' })
  @ApiResponse({ status: 200, description: 'Paginated deals list' })
  async getDeals(@Query() query: DealQueryDto) {
    return this.dealService.findPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed information about a single deal' })
  @ApiResponse({ status: 200, description: 'Deal details with lead information' })
  async getDealById(@Param('id') id: string) {
    return this.dealService.findById(id);
  }
}
