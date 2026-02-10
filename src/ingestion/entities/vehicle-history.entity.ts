import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('vehicle_history')
export class VehicleHistory {
  @PrimaryColumn({ type: 'bigint', generated: true })
  id: number;

  @Column({ name: 'vehicle_id', type: 'varchar', length: 50 })
  vehicleId: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  soc: number;

  @Column({
    name: 'kwh_delivered_dc',
    type: 'decimal',
    precision: 10,
    scale: 4,
  })
  kwhDeliveredDc: number;

  @Column({
    name: 'battery_temp',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  batteryTemp: number;

  @PrimaryColumn({ type: 'timestamptz' })
  timestamp: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
