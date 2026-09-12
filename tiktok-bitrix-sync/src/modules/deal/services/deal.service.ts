import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DealQueryDto } from '../dto/deal-query.dto';

@Injectable()
export class DealService {
  constructor(private readonly prisma: PrismaService) {}

  async findPaginated(query: DealQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      if (query.status.toLowerCase() === 'open') {
        where.status = { in: ['pending', 'created'] };
      } else {
        where.status = query.status;
      }
    }
    if (query.assigned_to) where.assignedTo = query.assigned_to;
    if (query.stage) where.stage = query.stage;
    if (query.lead_id) where.leadId = query.lead_id;

    const [total, data] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              campaignName: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        lead: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal #${id} not found`);
    }

    return deal;
  }
}
