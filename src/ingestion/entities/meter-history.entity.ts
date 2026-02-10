import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('meter_history')
export class MeterHistory {
  @PrimaryColumn({ type: 'bigint', generated: true })
  id: number;

  @Column({ name: 'meter_id', type: 'varchar', length: 50 })
  meterId: string;

  @Column({
    name: 'kwh_consumed_ac',
    type: 'decimal',
    precision: 10,
    scale: 4,
  })
  kwhConsumedAc: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
  })
  voltage: number;

  @PrimaryColumn({ type: 'timestamptz' })
  timestamp: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
