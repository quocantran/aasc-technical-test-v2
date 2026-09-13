import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReportExportService {
  constructor(private readonly prisma: PrismaService) {}

  // Exports leads data in CSV or JSON using chunked cursor processing to prevent OOM
  async exportLeads(format = 'csv', dateRange = '30d') {
    let startDate: Date | undefined;
    const now = new Date();

    if (dateRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const where: any = {};
    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    const CHUNK_SIZE = 1000;
    let cursor: string | undefined = undefined;
    let hasMore = true;
    const allLeads: any[] = [];
    const rows: string[] = [];

    while (hasMore) {
      const chunk: any[] = await this.prisma.lead.findMany({
        where,
        take: CHUNK_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        include: {
          deals: { select: { id: true, bitrix24Id: true, title: true, stage: true, amount: true, status: true } },
        },
      });

      if (!chunk || chunk.length === 0) {
        hasMore = false;
        break;
      }

      if (chunk.length < CHUNK_SIZE) {
        hasMore = false;
      } else {
        cursor = chunk[chunk.length - 1].id;
      }

      if (format.toLowerCase() === 'json') {
        allLeads.push(...chunk);
      } else {
        for (const l of chunk) {
          rows.push(this.formatLeadCsvRow(l));
        }
      }
    }

    if (format.toLowerCase() === 'json') {
      return allLeads;
    }

    // Generate CSV format with UTF-8 BOM
    const headers = this.getCsvHeaders();
    return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  }

  // Streams CSV or genuine Excel (.xlsx) output directly into HTTP response to prevent heap OOM
  async streamCsvExport(res: any, dateRange = '30d', isExcel = false): Promise<void> {
    if (isExcel) {
      return this.streamExcelExport(res, dateRange);
    }

    let startDate: Date | undefined;
    const now = new Date();

    if (dateRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const where: any = {};
    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tiktok_leads_export_${Date.now()}.csv"`,
    );

    // Send UTF-8 BOM bytes so Excel opens CSV without font breakage
    res.write(Buffer.from([0xef, 0xbb, 0xbf]));
    const headers = this.getCsvHeaders();
    res.write(headers.join(',') + '\r\n');

    const CHUNK_SIZE = 1000;
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const chunk: any[] = await this.prisma.lead.findMany({
        where,
        take: CHUNK_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        include: {
          deals: { select: { id: true, bitrix24Id: true, title: true, stage: true, amount: true, status: true } },
        },
      });

      if (!chunk || chunk.length === 0) {
        break;
      }

      for (const l of chunk) {
        res.write(this.formatLeadCsvRow(l) + '\r\n');
      }

      if (chunk.length < CHUNK_SIZE) {
        break;
      }
      cursor = chunk[chunk.length - 1].id;
    }

    res.end();
  }

  // Generates genuine, styled Microsoft Excel (.xlsx) workbook with zero font corruption
  async streamExcelExport(res: any, dateRange = '30d'): Promise<void> {
    let startDate: Date | undefined;
    const now = new Date();

    if (dateRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const where: any = {};
    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tiktok_leads_export_${Date.now()}.xlsx"`,
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AASC TikTok-Bitrix Integration Engine';
    const worksheet = workbook.addWorksheet('Danh sách Lead TikTok', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = [
      { header: 'Mã Lead (UUID)', key: 'id', width: 38 },
      { header: 'Mã sự kiện TikTok', key: 'externalId', width: 30 },
      { header: 'Họ và tên khách hàng', key: 'name', width: 25 },
      { header: 'Số điện thoại', key: 'phone', width: 18, style: { numFmt: '@' } },
      { header: 'Địa chỉ Email', key: 'email', width: 28 },
      { header: 'Tỉnh / Thành phố', key: 'city', width: 18 },
      { header: 'Tên chiến dịch quảng cáo', key: 'campaignName', width: 30 },
      { header: 'Tên mẫu quảng cáo', key: 'adName', width: 28 },
      { header: 'Tên biểu mẫu TikTok', key: 'formName', width: 25 },
      { header: 'Điểm chất lượng Lead', key: 'qualityScore', width: 20 },
      { header: 'Mã Lead Bitrix24', key: 'bitrix24Id', width: 20 },
      { header: 'Trạng thái xử lý Lead', key: 'status', width: 20 },
      { header: 'Mã Deal Bitrix24', key: 'dealBitrixId', width: 20 },
      { header: 'Tiêu đề Deal CRM', key: 'dealTitle', width: 32 },
      { header: 'Giai đoạn Deal', key: 'dealStage', width: 18 },
      { header: 'Giá trị Deal (VNĐ)', key: 'dealAmount', width: 20, style: { numFmt: '#,##0' } },
      { header: 'Khảo sát khách hàng', key: 'customQuestions', width: 36 },
      { header: 'Mã Click TikTok (TTCLID)', key: 'ttclid', width: 28 },
      { header: 'Nguồn UTM', key: 'utmSource', width: 18 },
      { header: 'Chiến dịch UTM', key: 'utmCampaign', width: 22 },
      { header: 'Thời gian tạo Lead', key: 'createdAt', width: 24 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' }, // Navy blue CRM theme
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const CHUNK_SIZE = 1000;
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const chunk: any[] = await this.prisma.lead.findMany({
        where,
        take: CHUNK_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        include: {
          deals: { select: { id: true, bitrix24Id: true, title: true, stage: true, amount: true, status: true } },
        },
      });

      if (!chunk || chunk.length === 0) {
        break;
      }

      for (const l of chunk) {
        const deal = l.deals && l.deals.length > 0 ? l.deals[0] : null;
        let formattedQuestions = '';
        if (Array.isArray(l.customQuestions)) {
          formattedQuestions = l.customQuestions
            .map((q: any) => `${q.question || ''}: ${q.answer || ''}`)
            .join(' | ');
        } else if (typeof l.customQuestions === 'object' && l.customQuestions !== null) {
          formattedQuestions = JSON.stringify(l.customQuestions);
        }

        const row = worksheet.addRow({
          id: l.id,
          externalId: l.externalId,
          name: l.name,
          phone: String(l.phone || ''),
          email: l.email || '',
          city: l.city || '',
          campaignName: l.campaignName || '',
          adName: l.adName || '',
          formName: l.formName || '',
          qualityScore: l.qualityScore || 0,
          bitrix24Id: l.bitrix24Id || '',
          status: l.status,
          dealBitrixId: deal?.bitrix24Id || '',
          dealTitle: deal?.title || '',
          dealStage: deal?.stage || '',
          dealAmount: deal?.amount ? Number(deal.amount) : 0,
          customQuestions: formattedQuestions,
          ttclid: l.ttclid || '',
          utmSource: l.utmSource || '',
          utmCampaign: l.utmCampaign || '',
          createdAt: l.createdAt instanceof Date 
            ? l.createdAt.toISOString().replace('T', ' ').substring(0, 19) 
            : String(l.createdAt || ''),
        });

        row.font = { name: 'Segoe UI', size: 10 };
        // Ensure phone cell alignment is left-aligned text
        row.getCell('phone').alignment = { horizontal: 'left' };
        row.getCell('qualityScore').alignment = { horizontal: 'center' };
        row.getCell('bitrix24Id').alignment = { horizontal: 'center' };
        row.getCell('dealBitrixId').alignment = { horizontal: 'center' };
        row.getCell('dealStage').alignment = { horizontal: 'center' };
        row.getCell('status').alignment = { horizontal: 'center' };
      }

      if (chunk.length < CHUNK_SIZE) {
        break;
      }
      cursor = chunk[chunk.length - 1].id;
    }

    await workbook.xlsx.write(res);
    if (typeof res.end === 'function') {
      res.end();
    }
  }

  private getCsvHeaders(): string[] {
    return [
      'Mã Lead (UUID)',
      'Mã sự kiện TikTok',
      'Họ và tên khách hàng',
      'Số điện thoại',
      'Địa chỉ Email',
      'Tỉnh / Thành phố',
      'Tên chiến dịch quảng cáo',
      'Tên mẫu quảng cáo',
      'Tên biểu mẫu TikTok',
      'Điểm chất lượng Lead',
      'Mã Lead Bitrix24',
      'Trạng thái xử lý Lead',
      'Mã Deal Bitrix24',
      'Tiêu đề Deal CRM',
      'Giai đoạn Deal',
      'Giá trị Deal (VNĐ)',
      'Khảo sát khách hàng',
      'Mã Click TikTok (TTCLID)',
      'Nguồn UTM',
      'Chiến dịch UTM',
      'Thời gian tạo Lead',
    ];
  }

  private formatLeadCsvRow(l: any): string {
    const deal = l.deals && l.deals.length > 0 ? l.deals[0] : null;
    let formattedQuestions = '';
    if (Array.isArray(l.customQuestions)) {
      formattedQuestions = l.customQuestions
        .map((q: any) => `${q.question || ''}: ${q.answer || ''}`)
        .join(' | ');
    } else if (typeof l.customQuestions === 'object' && l.customQuestions !== null) {
      formattedQuestions = JSON.stringify(l.customQuestions);
    }

    return [
      l.id,
      l.externalId,
      this.escapeCsv(l.name),
      this.escapeCsv(l.phone || ''),
      l.email || '',
      this.escapeCsv(l.city || ''),
      this.escapeCsv(l.campaignName || ''),
      this.escapeCsv(l.adName || ''),
      this.escapeCsv(l.formName || ''),
      l.qualityScore || 0,
      l.bitrix24Id || '',
      l.status,
      deal?.bitrix24Id || '',
      this.escapeCsv(deal?.title || ''),
      deal?.stage || '',
      deal?.amount ? Number(deal.amount) : 0,
      this.escapeCsv(formattedQuestions),
      l.ttclid || '',
      l.utmSource || '',
      l.utmCampaign || '',
      l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
    ].join(',');
  }

  public escapeCsv(val: string): string {
    if (!val) return '""';
    let clean = String(val).replace(/"/g, '""');
    // Prevent CSV Formula Injection (CWE-1236)
    if (/^[=+\-@\t\r]/.test(clean)) {
      clean = `'${clean}`;
    }
    return `"${clean}"`;
  }
}
