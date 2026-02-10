import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('meter_current')
export class MeterCurrent {
  @PrimaryColumn({ name: 'meter_id', type: 'varchar', length: 50 })
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

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
