import { ReportExportService } from './report-export.service';

describe('ReportExportService', () => {
  let service: ReportExportService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findMany: jest.fn(),
      },
    };
    service = new ReportExportService(mockPrisma);
  });

  describe('escapeCsv (Security - CWE-1236 Mitigation)', () => {
    it('should return empty quotes for empty or null values', () => {
      expect(service.escapeCsv('')).toBe('""');
      expect(service.escapeCsv(null as any)).toBe('""');
      expect(service.escapeCsv(undefined as any)).toBe('""');
    });

    it('should wrap standard text in double quotes', () => {
      expect(service.escapeCsv('John Doe')).toBe('"John Doe"');
    });

    it('should escape internal double quotes properly', () => {
      expect(service.escapeCsv('He said "Hello"')).toBe('"He said ""Hello"""');
    });

    it('should sanitize dangerous formula prefixes with a single quote', () => {
      expect(service.escapeCsv("=CMD|' /C calc'!A0")).toBe('"\'=CMD|\' /C calc\'!A0"');
      expect(service.escapeCsv('+12345')).toBe('"\' +12345"'.replace(' ', ''));
      expect(service.escapeCsv('-SUM(A1:A10)')).toBe('"\' -SUM(A1:A10)"'.replace(' ', ''));
      expect(service.escapeCsv('@danger')).toBe('"\' @danger"'.replace(' ', ''));
      expect(service.escapeCsv('\tTabInjected')).toBe('"\' \tTabInjected"'.replace(' ', ''));
      expect(service.escapeCsv('\rReturnInjected')).toBe('"\' \rReturnInjected"'.replace(' ', ''));
    });
  });

  describe('exportLeads', () => {
    const sampleLead = {
      id: 'lead-1',
      externalId: 'ext-1',
      name: 'Nguyen Van A',
      phone: '+84901234567',
      email: 'a@example.com',
      city: 'Hanoi',
      campaignName: 'Summer Sale',
      adName: 'Ad 1',
      bitrix24Id: '100',
      status: 'CONVERTED',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      deals: [{ id: 'deal-1', bitrix24Id: '200', stage: 'WON', amount: 5000000, status: 'WON' }],
    };

    it('should export leads as CSV with UTF-8 BOM', async () => {
      mockPrisma.lead.findMany.mockResolvedValueOnce([sampleLead]);
      const csv = await service.exportLeads('csv', '7d');

      expect(csv).toContain('\uFEFF');
      expect(csv).toContain('ID,External ID,Name');
      expect(csv).toContain('Nguyen Van A');
      expect(csv).toContain('5000000');
    });

    it('should export leads as JSON when requested', async () => {
      mockPrisma.lead.findMany.mockResolvedValueOnce([sampleLead]);
      const json = await service.exportLeads('json', '90d');

      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(1);
      expect(json[0].id).toBe('lead-1');
    });

    it('should handle pagination when chunk is full', async () => {
      const fullChunk = Array.from({ length: 1000 }, (_, i) => ({
        ...sampleLead,
        id: `lead-${i}`,
      }));
      mockPrisma.lead.findMany
        .mockResolvedValueOnce(fullChunk)
        .mockResolvedValueOnce([]);

      const result = await service.exportLeads('json', '30d');
      expect(result).toHaveLength(1000);
      expect(mockPrisma.lead.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('streamCsvExport', () => {
    it('should stream CSV response chunks with proper headers', async () => {
      const sampleLead = {
        id: 'lead-1',
        externalId: 'ext-1',
        name: 'Nguyen Van B',
        phone: '+84901234568',
        email: 'b@example.com',
        city: 'HCMC',
        campaignName: 'Campaign B',
        adName: 'Ad B',
        bitrix24Id: '101',
        status: 'NEW',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        deals: [],
      };

      mockPrisma.lead.findMany.mockResolvedValueOnce([sampleLead]);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      await service.streamCsvExport(mockRes, '30d', false);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.write).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should set Excel MIME type when isExcel is true', async () => {
      mockPrisma.lead.findMany.mockResolvedValueOnce([]);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      await service.streamCsvExport(mockRes, '7d', true);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    });

    it('should handle export with custom or undefined dateRange and without deals', async () => {
      const leadNoDeals = {
        id: 'lead-no-deals',
        externalId: 'ext-no-deals',
        name: 'No Deals Lead',
        phone: null,
        email: null,
        city: null,
        campaignName: null,
        adName: null,
        bitrix24Id: null,
        status: 'NEW',
        createdAt: '2026-09-01T00:00:00Z', // string instead of Date
        deals: null,
      };
      mockPrisma.lead.findMany.mockResolvedValueOnce([leadNoDeals]);

      const csv = await service.exportLeads('csv', 'custom_range');
      expect(csv).toContain('No Deals Lead');
    });

    it('should handle empty chunk on first query', async () => {
      mockPrisma.lead.findMany.mockResolvedValueOnce([]);
      const result = await service.exportLeads('json', '7d');
      expect(result).toEqual([]);
    });

    it('should stream pagination chunks when chunk size reaches limit', async () => {
      const fullChunk = Array.from({ length: 1000 }, (_, i) => ({
        id: `stream-lead-${i}`,
        externalId: `ext-${i}`,
        name: `Lead ${i}`,
        createdAt: new Date(),
        deals: [{ amount: 1000 }],
      }));

      mockPrisma.lead.findMany
        .mockResolvedValueOnce(fullChunk)
        .mockResolvedValueOnce([]);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      await service.streamCsvExport(mockRes, '90d', false);
      expect(mockPrisma.lead.findMany).toHaveBeenCalledTimes(2);
      expect(mockRes.write).toHaveBeenCalled();
    });

    it('should stream CSV with unknown dateRange', async () => {
      mockPrisma.lead.findMany.mockResolvedValueOnce([]);
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      await service.streamCsvExport(mockRes, 'all', false);
      expect(mockRes.setHeader).toHaveBeenCalled();
    });
  });
});
