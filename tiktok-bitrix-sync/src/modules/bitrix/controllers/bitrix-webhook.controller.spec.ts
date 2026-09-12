import { BitrixWebhookController } from './bitrix-webhook.controller';
import { BitrixWebhookService } from '../services/bitrix-webhook.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BitrixWebhookController', () => {
  let controller: BitrixWebhookController;
  let mockWebhookService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockWebhookService = {
      processDealWebhook: jest.fn(),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    controller = new BitrixWebhookController(
      mockWebhookService as BitrixWebhookService,
      mockLogger as AppLogger,
    );
  });

  it('should delegate handleDealWebhook to webhookService.processDealWebhook', async () => {
    const payload = {
      event: 'ONCRMDEALUPDATE',
      data: { FIELDS: { ID: 5001, STAGE_ID: 'WON' } },
    };
    const expected = { success: true, status: 'accepted', dealId: 5001 };
    mockWebhookService.processDealWebhook.mockResolvedValueOnce(expected);

    const result = await controller.handleDealWebhook(payload);
    expect(result).toBe(expected);
    expect(mockWebhookService.processDealWebhook).toHaveBeenCalledWith(payload);
    expect(mockLogger.log).toHaveBeenCalled();
  });

  it('should instantiate with default logger if none provided', () => {
    const defaultController = new BitrixWebhookController(
      mockWebhookService as BitrixWebhookService,
    );
    expect(defaultController).toBeDefined();
  });
});
