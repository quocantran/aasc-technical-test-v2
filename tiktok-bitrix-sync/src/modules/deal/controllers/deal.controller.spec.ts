import { DealController } from './deal.controller';
import { DealService } from '../services/deal.service';

describe('DealController', () => {
  let controller: DealController;
  let mockDealService: any;

  beforeEach(() => {
    mockDealService = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
    };
    controller = new DealController(mockDealService as DealService);
  });

  it('should delegate getDeals to dealService.findPaginated', async () => {
    const query = { page: 1, limit: 10, status: 'created', stage: 'WON' };
    const expected = { data: [{ id: 'deal-1' }], meta: { total: 1 } };
    mockDealService.findPaginated.mockResolvedValueOnce(expected);

    const result = await controller.getDeals(query as any);
    expect(result).toBe(expected);
    expect(mockDealService.findPaginated).toHaveBeenCalledWith(query);
  });

  it('should delegate getDealById to dealService.findById', async () => {
    const expected = { id: 'deal-1', title: 'Deal One' };
    mockDealService.findById.mockResolvedValueOnce(expected);

    const result = await controller.getDealById('deal-1');
    expect(result).toBe(expected);
    expect(mockDealService.findById).toHaveBeenCalledWith('deal-1');
  });
});
