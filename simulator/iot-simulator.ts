/**
 * IoT Device Simulator for High-Scale Energy Ingestion Engine
 *
 * Simulates realistic telemetry data from Smart Meters and EV Chargers
 * - Configurable number of devices
 * - Configurable heartbeat interval
 * - Realistic efficiency correlation (DC = 85-95% of AC)
 * - Simulates clock drift (±5 seconds)
 */

import axios from 'axios';

// ============================================
// CONFIGURATION
// ============================================

const API_URL = process.env.API_URL || 'http://localhost:3000/v1/ingest';
const NUM_DEVICES = parseInt(process.env.NUM_DEVICES || '100'); // Start with 100 devices
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '60000'); // 60 seconds (real-time)
const FAST_MODE = process.env.FAST_MODE === 'true'; // If true, send every 1 second (60× faster)
const ACTUAL_INTERVAL = FAST_MODE ? 1000 : INTERVAL_MS;

// ============================================
// DEVICE STATE
// ============================================

interface DeviceState {
  meterId: string;
  vehicleId: string;
  currentSoc: number; // State of Charge (battery %)
  baseVoltage: number; // Base voltage for this meter
  chargingRate: number; // kWh per reading
}

const devices: Map<number, DeviceState> = new Map();

// Initialize device states
for (let i = 1; i <= NUM_DEVICES; i++) {
  const deviceId = `VEHICLE_${String(i).padStart(3, '0')}`;
  devices.set(i, {
    meterId: deviceId, // Use same ID for meter and vehicle (they're the same device)
    vehicleId: deviceId,
    currentSoc: 60 + Math.random() * 30, // Start between 60-90%
    baseVoltage: 220 + Math.random() * 10, // 220-230V
    chargingRate: 5 + Math.random() * 5, // 5-10 kWh per hour
  });
}

// ============================================
// TELEMETRY GENERATION
// ============================================

function generateMeterData(state: DeviceState): any {
  // Simulate voltage fluctuation
  const voltage = state.baseVoltage + (Math.random() - 0.5) * 5;

  // Calculate kWh consumed (incremental based on charging rate)
  const kwhConsumedAc = state.chargingRate / 60; // Per minute

  // Simulate clock drift (±5 seconds)
  const timestamp = new Date(Date.now() + (Math.random() - 0.5) * 10000);

  return {
    meterId: state.meterId,
    kwhConsumedAc: parseFloat(kwhConsumedAc.toFixed(4)),
    voltage: parseFloat(voltage.toFixed(2)),
    timestamp: timestamp.toISOString(),
  };
}

function generateVehicleData(state: DeviceState, meterData: any): any {
  // Realistic efficiency: DC is 85-95% of AC due to conversion loss
  const efficiency = 0.85 + Math.random() * 0.1;
  const kwhDeliveredDc = meterData.kwhConsumedAc * efficiency;

  // Update SoC (assuming 100 kWh battery capacity)
  const batteryCapacity = 100;
  const socIncrease = (kwhDeliveredDc / batteryCapacity) * 100;
  state.currentSoc = Math.min(100, state.currentSoc + socIncrease);

  // Battery temperature increases slightly during charging
  const batteryTemp = 25 + Math.random() * 10 + state.currentSoc / 10;

  // Simulate clock drift (should be close to meter timestamp)
  const timestamp = new Date(
    new Date(meterData.timestamp).getTime() + (Math.random() - 0.5) * 4000,
  );

  return {
    vehicleId: state.vehicleId,
    soc: parseFloat(state.currentSoc.toFixed(2)),
    kwhDeliveredDc: parseFloat(kwhDeliveredDc.toFixed(4)),
    batteryTemp: parseFloat(batteryTemp.toFixed(2)),
    timestamp: timestamp.toISOString(),
  };
}

// ============================================
// API COMMUNICATION
// ============================================

async function sendTelemetry(deviceId: number): Promise<void> {
  const state = devices.get(deviceId)!;

  try {
    // Generate correlated data
    const meterData = generateMeterData(state);
    const vehicleData = generateVehicleData(state, meterData);

    // Send both readings in parallel
    await Promise.all([
      axios.post(`${API_URL}/meter`, meterData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }),
      axios.post(`${API_URL}/vehicle`, vehicleData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }),
    ]);

    // Success indicator (only show for first few devices to avoid spam)
    if (deviceId <= 5) {
      console.log(
        `✓ Device ${deviceId}: SoC=${vehicleData.soc}%, Efficiency=${((vehicleData.kwhDeliveredDc / meterData.kwhConsumedAc) * 100).toFixed(1)}%`,
      );
    }
  } catch (error: any) {
    console.error(`✗ Device ${deviceId} failed: ${error.message}`);
  }
}

// ============================================
// BATCH SENDING
// ============================================

async function sendBatch(): Promise<void> {
  const startTime = Date.now();

  // Send all devices in parallel (but with some concurrency control)
  const batchSize = 50; // Send 50 devices at a time
  for (let i = 1; i <= NUM_DEVICES; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, NUM_DEVICES + 1); j++) {
      batch.push(sendTelemetry(j));
    }
    await Promise.allSettled(batch);
  }

  const duration = Date.now() - startTime;
  const throughput = (NUM_DEVICES * 2) / (duration / 1000);

  console.log(
    `\n📊 Batch complete: ${NUM_DEVICES * 2} records sent in ${duration}ms (${throughput.toFixed(0)} writes/sec)\n`,
  );
}

// ============================================
// MAIN SIMULATOR
// ============================================

async function startSimulator() {
  console.log('\n🚀 ================================================');
  console.log('🚀  IoT Device Simulator Started');
  console.log('🚀 ================================================');
  console.log(`📡  API Endpoint: ${API_URL}`);
  console.log(`🔢  Number of Devices: ${NUM_DEVICES}`);
  console.log(`⏱️   Heartbeat Interval: ${ACTUAL_INTERVAL}ms (${ACTUAL_INTERVAL / 1000}s)`);
  console.log(
    `📊  Expected Throughput: ${((NUM_DEVICES * 2 * 1000) / ACTUAL_INTERVAL).toFixed(0)} writes/sec`,
  );
  console.log('🚀 ================================================\n');

  // Test connection
  try {
    await axios.get(API_URL.replace('/v1/ingest', '/health'), { timeout: 3000 });
    console.log('✅ API connection successful\n');
  } catch (error) {
    console.error('❌ Failed to connect to API. Is the server running?');
    console.error(`   Try: npm run start:dev\n`);
    process.exit(1);
  }

  // Send first batch immediately
  await sendBatch();

  // Then send at intervals
  setInterval(async () => {
    await sendBatch();
  }, ACTUAL_INTERVAL);
}

// ============================================
// ENTRY POINT
// ============================================

startSimulator().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Simulator stopped gracefully');
  process.exit(0);
});
