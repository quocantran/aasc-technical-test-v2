import { ConfigController } from './config.controller';
import { ConfigService } from '../services/config.service';

describe('ConfigController', () => {
  let controller: ConfigController;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      getFieldMappings: jest.fn(),
      updateFieldMappings: jest.fn(),
      getDealRules: jest.fn(),
      updateDealRules: jest.fn(),
    };
    controller = new ConfigController(mockConfigService as ConfigService);
  });

  it('should delegate getMappings to configService.getFieldMappings', async () => {
    const expected = { field_mapping: { full_name: 'NAME' } };
    mockConfigService.getFieldMappings.mockResolvedValueOnce(expected);

    const result = await controller.getMappings();
    expect(result).toBe(expected);
    expect(mockConfigService.getFieldMappings).toHaveBeenCalled();
  });

  it('should delegate updateMappings to configService.updateFieldMappings', async () => {
    const dto = { field_mapping: { full_name: 'NAME', phone: 'PHONE' } };
    const expected = { success: true, count: 2 };
    mockConfigService.updateFieldMappings.mockResolvedValueOnce(expected);

    const result = await controller.updateMappings(dto as any);
    expect(result).toBe(expected);
    expect(mockConfigService.updateFieldMappings).toHaveBeenCalledWith(dto);
  });

  it('should delegate getRules to configService.getDealRules', async () => {
    const expected = [{ id: 'rule-1', name: 'High Value Lead' }];
    mockConfigService.getDealRules.mockResolvedValueOnce(expected);

    const result = await controller.getRules();
    expect(result).toBe(expected);
    expect(mockConfigService.getDealRules).toHaveBeenCalled();
  });

  it('should delegate updateRules to configService.updateDealRules', async () => {
    const dto = { deal_rules: [{ id: 'rule-1', name: 'Rule 1' }] };
    const expected = { success: true };
    mockConfigService.updateDealRules.mockResolvedValueOnce(expected);

    const result = await controller.updateRules(dto as any);
    expect(result).toBe(expected);
    expect(mockConfigService.updateDealRules).toHaveBeenCalledWith(dto.deal_rules);
  });
});
