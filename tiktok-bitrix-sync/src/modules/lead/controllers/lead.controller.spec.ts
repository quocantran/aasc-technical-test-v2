import { LeadController } from './lead.controller';
import { LeadService } from '../services/lead.service';
import { BatchMigrationService } from '../services/batch-migration.service';
import { DealConversionService } from '../../deal/services/deal-conversion.service';

describe('LeadController', () => {
  let controller: LeadController;
  let mockLeadService: any;
  let mockBatchMigrationService: any;
  let mockDealConversionService: any;

  beforeEach(() => {
    mockLeadService = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
    };
    mockBatchMigrationService = {
      startBatchMigration: jest.fn(),
      getJobStatus: jest.fn(),
    };
    mockDealConversionService = {
      convertLeadToDeal: jest.fn(),
    };

    controller = new LeadController(
      mockLeadService as LeadService,
      mockBatchMigrationService as BatchMigrationService,
      mockDealConversionService as DealConversionService,
    );
  });

  it('should delegate getLeads to leadService.findPaginated', async () => {
    const query = { page: 1, limit: 10, status: 'synced' };
    const expected = { data: [{ id: 'lead-1' }], meta: { total: 1 } };
    mockLeadService.findPaginated.mockResolvedValueOnce(expected);

    const result = await controller.getLeads(query as any);
    expect(result).toBe(expected);
    expect(mockLeadService.findPaginated).toHaveBeenCalledWith(query);
  });

  it('should delegate getLeadById to leadService.findById', async () => {
    const expected = { id: 'lead-1', name: 'John Doe' };
    mockLeadService.findById.mockResolvedValueOnce(expected);

    const result = await controller.getLeadById('lead-1');
    expect(result).toBe(expected);
    expect(mockLeadService.findById).toHaveBeenCalledWith('lead-1');
  });

  it('should delegate batchMigrate to batchMigrationService.startBatchMigration', async () => {
    const dto = { date_range: '30d', dry_run: false };
    const expected = { jobId: 'job-123', status: 'enqueued' };
    mockBatchMigrationService.startBatchMigration.mockResolvedValueOnce(expected);

    const result = await controller.batchMigrate(dto as any);
    expect(result).toBe(expected);
    expect(mockBatchMigrationService.startBatchMigration).toHaveBeenCalledWith(dto);
  });

  it('should delegate getMigrationStatus to batchMigrationService.getJobStatus', async () => {
    const expected = { jobId: 'job-123', status: 'completed', total: 50 };
    mockBatchMigrationService.getJobStatus.mockResolvedValueOnce(expected);

    const result = await controller.getMigrationStatus('job-123');
    expect(result).toBe(expected);
    expect(mockBatchMigrationService.getJobStatus).toHaveBeenCalledWith('job-123');
  });

  it('should delegate convertToDeal to dealConversionService.convertLeadToDeal', async () => {
    const dto = { deal_title: 'Custom Deal', opportunity: 1000000 };
    const expected = { converted: true, bitrix24Id: 5001 };
    mockDealConversionService.convertLeadToDeal.mockResolvedValueOnce(expected);

    const result = await controller.convertToDeal('lead-1', dto as any);
    expect(result).toBe(expected);
    expect(mockDealConversionService.convertLeadToDeal).toHaveBeenCalledWith('lead-1', dto);
  });
});
