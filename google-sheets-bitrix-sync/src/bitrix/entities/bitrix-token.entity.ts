import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// TypeORM entity storing Bitrix24 OAuth tokens and expiration metadata in SQLite
@Entity('bitrix_tokens')
export class BitrixTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, default: 'default' })
  domain: string;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text' })
  refreshToken: string;

  @Column({ type: 'integer', default: 3600 })
  expiresIn: number;

  @Column({ type: 'bigint', nullable: true })
  expiresAt: number;

  @Column({ nullable: true })
  memberId: string;

  @Column({ nullable: true })
  scope: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
