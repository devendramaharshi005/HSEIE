-- High-Scale Energy Ingestion Engine - Database Schema
-- Author: Devendra Maharshi
-- Description: Hot/Cold table separation with partitioning for time-series data

-- Enable UUID extension (optional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- HOT TABLES (Current State - UPSERT)
-- Purpose: Store current state of each device
-- Size: Fixed (10K-20K rows)
-- Access: Random reads (O(1) via primary key)
-- ============================================

CREATE TABLE meter_current (
    meter_id VARCHAR(50) PRIMARY KEY,
    kwh_consumed_ac DECIMAL(10, 4) NOT NULL,
    voltage DECIMAL(6, 2) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicle_current (
    vehicle_id VARCHAR(50) PRIMARY KEY,
    soc DECIMAL(5, 2) NOT NULL,
    kwh_delivered_dc DECIMAL(10, 4) NOT NULL,
    battery_temp DECIMAL(5, 2) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for hot tables
CREATE INDEX idx_meter_current_timestamp ON meter_current(timestamp DESC);
CREATE INDEX idx_vehicle_current_timestamp ON vehicle_current(timestamp DESC);

-- Optimize for frequent UPSERTs (leave room for row updates)
ALTER TABLE meter_current SET (fillfactor = 70);
ALTER TABLE vehicle_current SET (fillfactor = 70);

-- ============================================
-- COLD TABLES (Historical - INSERT only)
-- Purpose: Append-only audit trail for analytics
-- Size: Growing (28M+ rows/day)
-- Access: Range scans with partition pruning
-- ============================================

CREATE TABLE meter_history (
    id BIGSERIAL,
    meter_id VARCHAR(50) NOT NULL,
    kwh_consumed_ac DECIMAL(10, 4) NOT NULL,
    voltage DECIMAL(6, 2) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE vehicle_history (
    id BIGSERIAL,
    vehicle_id VARCHAR(50) NOT NULL,
    soc DECIMAL(5, 2) NOT NULL,
    kwh_delivered_dc DECIMAL(10, 4) NOT NULL,
    battery_temp DECIMAL(5, 2) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Composite indexes for analytics queries (avoid full table scan)
CREATE INDEX idx_meter_history_lookup ON meter_history(meter_id, timestamp DESC);
CREATE INDEX idx_vehicle_history_lookup ON vehicle_history(vehicle_id, timestamp DESC);

-- ============================================
-- CREATE PARTITIONS (Current & Next Month)
-- Note: In production, automate partition creation
-- ============================================

-- February 2026
CREATE TABLE meter_history_2026_02 PARTITION OF meter_history
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE vehicle_history_2026_02 PARTITION OF vehicle_history
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- March 2026 (for boundary cases)
CREATE TABLE meter_history_2026_03 PARTITION OF meter_history
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE vehicle_history_2026_03 PARTITION OF vehicle_history
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- April 2026
CREATE TABLE meter_history_2026_04 PARTITION OF meter_history
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE vehicle_history_2026_04 PARTITION OF vehicle_history
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- ============================================
-- MATERIALIZED VIEW (Optional - For Analytics)
-- Purpose: Pre-aggregated hourly statistics
-- Refresh: Every hour (background job)
-- ============================================

CREATE MATERIALIZED VIEW hourly_performance AS
SELECT 
    v.vehicle_id,
    DATE_TRUNC('hour', v.timestamp) as hour,
    SUM(v.kwh_delivered_dc) as total_dc,
    AVG(v.soc) as avg_soc,
    AVG(v.battery_temp) as avg_battery_temp,
    COUNT(*) as reading_count
FROM vehicle_history v
GROUP BY v.vehicle_id, DATE_TRUNC('hour', v.timestamp);

CREATE INDEX idx_hourly_perf ON hourly_performance(vehicle_id, hour DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to create next month's partition
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS void AS $$
DECLARE
    next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    next_next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
    partition_name_meter TEXT;
    partition_name_vehicle TEXT;
BEGIN
    partition_name_meter := 'meter_history_' || TO_CHAR(next_month, 'YYYY_MM');
    partition_name_vehicle := 'vehicle_history_' || TO_CHAR(next_month, 'YYYY_MM');
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF meter_history FOR VALUES FROM (%L) TO (%L)',
                   partition_name_meter, next_month, next_next_month);
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF vehicle_history FOR VALUES FROM (%L) TO (%L)',
                   partition_name_vehicle, next_month, next_next_month);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================

-- Insert sample current state
INSERT INTO meter_current (meter_id, kwh_consumed_ac, voltage, timestamp)
VALUES 
    ('METER_001', 10.50, 230.00, NOW()),
    ('METER_002', 8.75, 228.50, NOW()),
    ('METER_003', 12.30, 231.20, NOW());

INSERT INTO vehicle_current (vehicle_id, soc, kwh_delivered_dc, battery_temp, timestamp)
VALUES 
    ('VEHICLE_001', 75.50, 9.50, 28.50, NOW()),
    ('VEHICLE_002', 82.30, 7.80, 27.00, NOW()),
    ('VEHICLE_003', 91.00, 11.20, 29.80, NOW());

-- Insert sample historical data
INSERT INTO meter_history (meter_id, kwh_consumed_ac, voltage, timestamp)
VALUES 
    ('METER_001', 10.50, 230.00, NOW() - INTERVAL '1 hour'),
    ('METER_001', 11.20, 229.50, NOW() - INTERVAL '30 minutes'),
    ('METER_001', 10.50, 230.00, NOW());

INSERT INTO vehicle_history (vehicle_id, soc, kwh_delivered_dc, battery_temp, timestamp)
VALUES 
    ('VEHICLE_001', 70.00, 9.50, 28.00, NOW() - INTERVAL '1 hour'),
    ('VEHICLE_001', 72.50, 9.50, 28.30, NOW() - INTERVAL '30 minutes'),
    ('VEHICLE_001', 75.50, 9.50, 28.50, NOW());

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant all privileges to postgres user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Display table info
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database schema initialized successfully!';
    RAISE NOTICE '📊 Hot tables: meter_current, vehicle_current';
    RAISE NOTICE '📚 Cold tables: meter_history, vehicle_history (partitioned)';
    RAISE NOTICE '🎯 Ready for 28.8M records/day ingestion';
END $$;



