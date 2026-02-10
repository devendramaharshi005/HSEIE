import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('vehicle_current')
export class VehicleCurrent {
  @PrimaryColumn({ name: 'vehicle_id', type: 'varchar', length: 50 })
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

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
