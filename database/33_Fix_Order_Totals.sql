/*
  Recalcula Subtotal / Igv / Total de pedidos a partir de OrderItems.
  Corrige comandas con ítems con precio y Total = 0 (adicionales de mesa).
  No toca Paid, Status, pagos ni cierre de caja.
*/
USE Polleria;
GO

DECLARE @igv DECIMAL(5, 4);
SELECT TOP 1 @igv = ISNULL(IgvRate, 0.18) FROM dbo.Settings WHERE Id = 1;
IF @igv IS NULL OR @igv <= 0 SET @igv = 0.18;

;WITH Gross AS (
  SELECT
    OrderId,
    SUM(CAST(Qty AS DECIMAL(12, 4)) * Price) AS ItemsGross
  FROM dbo.OrderItems
  GROUP BY OrderId
)
UPDATE o
SET
  Subtotal = ROUND(v.After / (1 + @igv), 2),
  Igv = ROUND(v.After - ROUND(v.After / (1 + @igv), 2), 2),
  Total = v.After,
  UpdatedAt = SYSUTCDATETIME()
FROM dbo.Orders o
INNER JOIN Gross g ON g.OrderId = o.Id
CROSS APPLY (
  SELECT CAST(
    ROUND(
      CASE
        WHEN g.ItemsGross - ISNULL(o.Discount, 0) < 0 THEN 0
        ELSE g.ItemsGross - ISNULL(o.Discount, 0)
      END,
      2
    ) AS DECIMAL(10, 2)
  ) AS After
) v
WHERE ABS(ISNULL(o.Total, 0) - v.After) >= 0.01;

SELECT @@ROWCOUNT AS OrdersTotalesCorregidos;
GO
