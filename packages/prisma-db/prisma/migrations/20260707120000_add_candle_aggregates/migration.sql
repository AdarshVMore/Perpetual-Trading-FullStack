-- Continuous OHLC aggregates from the Fills hypertable (TimescaleDB).
CREATE MATERIALIZED VIEW candles_1min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', "createdAt") AS bucket,
  "marketId",
  first("price", "createdAt") AS open,
  max("price") AS high,
  min("price") AS low,
  last("price", "createdAt") AS close,
  last("id", "createdAt") AS "lastTradeId"
FROM "Fills"
GROUP BY 1, 2
WITH NO DATA;

CREATE MATERIALIZED VIEW candles_1hour
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', "createdAt") AS bucket,
  "marketId",
  first("price", "createdAt") AS open,
  max("price") AS high,
  min("price") AS low,
  last("price", "createdAt") AS close,
  last("id", "createdAt") AS "lastTradeId"
FROM "Fills"
GROUP BY 1, 2
WITH NO DATA;

CREATE MATERIALIZED VIEW candles_1day
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 day', "createdAt") AS bucket,
  "marketId",
  first("price", "createdAt") AS open,
  max("price") AS high,
  min("price") AS low,
  last("price", "createdAt") AS close,
  last("id", "createdAt") AS "lastTradeId"
FROM "Fills"
GROUP BY 1, 2
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'candles_1min',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute'
);

SELECT add_continuous_aggregate_policy(
  'candles_1hour',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy(
  'candles_1day',
  start_offset => INTERVAL '90 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day'
);
