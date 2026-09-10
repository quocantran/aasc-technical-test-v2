import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// TypeORM entity storing synchronization execution history in SQLite with indexing for fast pagination
@Entity('sync_history')
export class SyncHistoryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 'SHEETS_TO_BITRIX' })
  direction: string;

  @Column({ type: 'integer', default: 0 })
  totalRows: number;

  @Column({ type: 'integer', default: 0 })
  created: number;

  @Column({ type: 'integer', default: 0 })
  updated: number;

  @Column({ type: 'integer', default: 0 })
  skipped: number;

  @Column({ type: 'integer', default: 0 })
  failed: number;

  @Column({ type: 'integer', default: 0 })
  deleted: number;

  @Column({ type: 'integer', default: 0 })
  durationMs: number;

  @Column()
  timestamp: string;

  @Column({ type: 'text', nullable: true })
  syncedLeadIds: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
