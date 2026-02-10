/**
 * Real-time Telemetry Generator for High-Scale Energy Ingestion Engine
 *
 * Generates telemetry data for a specific range of devices
 * - Configurable device range (--start, --end)
 * - Configurable interval (--interval in milliseconds)
 * - Realistic efficiency correlation (DC = 85-95% of AC)
 * - Simulates clock drift (±5 seconds)
 */

import axios from 'axios';

// ============================================
// COMMAND-LINE ARGUMENT PARSING
// ============================================

function parseArgs(): { start: number; end: number; interval: number } {
  const args = process.argv.slice(2);
  let start = 1;
  let end = 100;
  let interval = 60000; // Default 60 seconds

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) {
      start = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      end = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--interval' && args[i + 1]) {
      interval = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Validate arguments
  if (isNaN(start) || isNaN(end) || isNaN(interval)) {
    console.error('❌ Invalid arguments. Usage:');
    console.error(
      '   ts-node scripts/realtime-generator.ts --start <number> --end <number> --interval <milliseconds>',
    );
    process.exit(1);
  }

  if (start < 1 || end < 1 || start > end) {
    console.error('❌ Invalid range. Start must be >= 1 and <= end');
    process.exit(1);
  }

  if (interval < 100) {
    console.error('❌ Interval must be at least 100ms');
    process.exit(1);
  }

  return { start, end, interval };
}

// ============================================
// CONFIGURATION
// ============================================

const { start, end, interval } = parseArgs();
const API_URL = process.env.API_URL || 'http://localhost:3000/v1/ingest';
const NUM_DEVICES = end - start + 1;

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

// Initialize device states for the specified range
for (let i = start; i <= end; i++) {
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
  // Add ±10% variation to simulate real-world fluctuations
  const variation = 1 + (Math.random() - 0.5) * 0.2; // ±10% variation
  const kwhConsumedAc = (state.chargingRate / 60) * variation; // Per minute

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
    if (deviceId <= start + 4) {
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
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
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
// MAIN GENERATOR
// ============================================

async function startGenerator() {
  console.log('\n🚀 ================================================');
  console.log('🚀  Real-time Telemetry Generator Started');
  console.log('🚀 ================================================');
  console.log(`📡  API Endpoint: ${API_URL}`);
  console.log(`🔢  Device Range: ${start} - ${end} (${NUM_DEVICES} devices)`);
  console.log(`⏱️   Interval: ${interval}ms (${interval / 1000}s)`);
  console.log(
    `📊  Expected Throughput: ${((NUM_DEVICES * 2 * 1000) / interval).toFixed(0)} writes/sec`,
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
  }, interval);
}

// ============================================
// ENTRY POINT
// ============================================

startGenerator().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Generator stopped gracefully');
  process.exit(0);
});
