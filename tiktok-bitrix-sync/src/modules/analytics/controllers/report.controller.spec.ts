import { ReportController } from './report.controller';
import { ReportExportService } from '../services/report-export.service';
import { Response } from 'express';

describe('ReportController', () => {
  let controller: ReportController;
  let mockReportExportService: any;

  beforeEach(() => {
    mockReportExportService = {
      exportLeads: jest.fn(),
      streamCsvExport: jest.fn(),
    };
    controller = new ReportController(mockReportExportService as ReportExportService);
  });

  it('should export JSON data when format is json', async () => {
    const mockRes = {
      json: jest.fn(),
    } as any as Response;

    const data = [{ id: 'lead-1', name: 'John Doe' }];
    mockReportExportService.exportLeads.mockResolvedValueOnce(data);

    await controller.exportReport('json', '30d', mockRes);

    expect(mockReportExportService.exportLeads).toHaveBeenCalledWith('json', '30d');
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data,
      }),
    );
  });

  it('should stream CSV export when format is csv', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any as Response;

    mockReportExportService.streamCsvExport.mockResolvedValueOnce(undefined);

    await controller.exportReport('csv', '7d', mockRes);

    expect(mockReportExportService.streamCsvExport).toHaveBeenCalledWith(mockRes, '7d', false);
  });

  it('should stream Excel export when format is excel', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any as Response;

    mockReportExportService.streamCsvExport.mockResolvedValueOnce(undefined);

    await controller.exportReport('excel', '90d', mockRes);

    expect(mockReportExportService.streamCsvExport).toHaveBeenCalledWith(mockRes, '90d', true);
  });
});
