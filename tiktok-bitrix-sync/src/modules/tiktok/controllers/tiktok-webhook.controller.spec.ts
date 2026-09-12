import { TikTokWebhookController } from './tiktok-webhook.controller';
import { TikTokWebhookService } from '../services/tiktok-webhook.service';

describe('TikTokWebhookController', () => {
  let controller: TikTokWebhookController;
  let mockWebhookService: any;

  beforeEach(() => {
    mockWebhookService = {
      ingestWebhook: jest.fn(),
    };
    controller = new TikTokWebhookController(mockWebhookService as TikTokWebhookService);
  });

  it('should delegate handleLeadWebhook to webhookService.ingestWebhook', async () => {
    const dto = {
      event: 'lead.generate',
      event_id: 'evt_123',
      timestamp: 1709876543,
      lead_data: { full_name: 'Test Lead' },
    };
    const req = { body: dto };

    const expected = { success: true, status: 'accepted', event_id: 'evt_123' };
    mockWebhookService.ingestWebhook.mockResolvedValueOnce(expected);

    const result = await controller.handleLeadWebhook(dto as any, req);
    expect(result).toBe(expected);
    expect(mockWebhookService.ingestWebhook).toHaveBeenCalledWith(dto, dto);
  });
});
