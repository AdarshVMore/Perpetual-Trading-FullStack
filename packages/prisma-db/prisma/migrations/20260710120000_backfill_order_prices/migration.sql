-- Backfill missing order prices from their associated fills.
-- Chart candles already use Fills; Orders.price was defaulting to 0/null.
UPDATE "Orders" AS o
SET
  price = fill_prices.price,
  margin = CASE
    WHEN o.leverage > 0 THEN (fill_prices.price * o.qty) / o.leverage
    ELSE o.margin
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("orderId")
    "orderId",
    price
  FROM "Fills"
  WHERE price > 0
  ORDER BY "orderId", "createdAt" DESC
) AS fill_prices
WHERE o.id = fill_prices."orderId"
  AND (o.price IS NULL OR o.price = 0);
