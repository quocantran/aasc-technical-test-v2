import { Injectable } from '@nestjs/common';
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
          deals: { select: { id: true, bitrix24Id: true, stage: true, amount: true, status: true } },
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
          const dealCount = l.deals ? l.deals.length : 0;
          const totalValue = l.deals ? l.deals.reduce((acc: number, d: any) => acc + Number(d.amount || 0), 0) : 0;
          rows.push(
            [
              l.id,
              l.externalId,
              this.escapeCsv(l.name),
              l.phone || '',
              l.email || '',
              this.escapeCsv(l.city || ''),
              this.escapeCsv(l.campaignName || ''),
              this.escapeCsv(l.adName || ''),
              l.bitrix24Id || '',
              l.status,
              dealCount,
              totalValue,
              l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
            ].join(','),
          );
        }
      }
    }

    if (format.toLowerCase() === 'json') {
      return allLeads;
    }

    // Generate CSV format
    const headers = this.getCsvHeaders();
    return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  }

  // Streams CSV or Excel output directly into the HTTP response stream to prevent heap OOM
  async streamCsvExport(res: any, dateRange = '30d', isExcel = false): Promise<void> {
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

    res.setHeader('Content-Type', isExcel ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tiktok_leads_export_${Date.now()}.${isExcel ? 'csv' : 'csv'}"`,
    );

    const headers = this.getCsvHeaders();
    res.write('\uFEFF' + headers.join(',') + '\r\n');

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
          deals: { select: { id: true, bitrix24Id: true, stage: true, amount: true, status: true } },
        },
      });

      if (!chunk || chunk.length === 0) {
        break;
      }

      for (const l of chunk) {
        res.write(this.formatLeadRow(l) + '\r\n');
      }

      if (chunk.length < CHUNK_SIZE) {
        break;
      }
      cursor = chunk[chunk.length - 1].id;
    }

    res.end();
  }

  private getCsvHeaders(): string[] {
    return [
      'ID',
      'External ID',
      'Name',
      'Phone',
      'Email',
      'City',
      'Campaign Name',
      'Ad Name',
      'Bitrix24 Lead ID',
      'Status',
      'Deals Count',
      'Total Deal Value',
      'Created At',
    ];
  }

  private formatLeadRow(l: any): string {
    const dealCount = l.deals ? l.deals.length : 0;
    const totalValue = l.deals ? l.deals.reduce((acc: number, d: any) => acc + Number(d.amount || 0), 0) : 0;
    return [
      l.id,
      l.externalId,
      this.escapeCsv(l.name),
      l.phone || '',
      l.email || '',
      this.escapeCsv(l.city || ''),
      this.escapeCsv(l.campaignName || ''),
      this.escapeCsv(l.adName || ''),
      l.bitrix24Id || '',
      l.status,
      dealCount,
      totalValue,
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
