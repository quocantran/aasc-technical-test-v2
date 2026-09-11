import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// TypeORM entity storing Google OAuth tokens and expiration metadata in SQLite
@Entity('google_tokens')
export class GoogleTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, default: 'default' })
  identifier: string;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  @Column({ type: 'integer', default: 3600 })
  expiresIn: number;

  @Column({ type: 'bigint', nullable: true })
  expiresAt: number;

  @Column({ type: 'text', nullable: true })
  scope: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @UpdateDateColumn()
  updatedAt: Date;
}
