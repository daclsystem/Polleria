/*
  Salón y recojo ya cobrados que seguían en cocina (nunca pasaron por Empezar / Listo).
  El cobro posterior al pedido equivale a entregado. También cierra ítems de pedidos
  ya entregados para que no reaparezcan en la pantalla de cocina.
*/
USE Polleria;
GO
SET QUOTED_IDENTIFIER ON;
GO

UPDATE i
SET KitchenStatus = N'listo'
FROM dbo.OrderItems i
INNER JOIN dbo.Orders o ON o.Id = i.OrderId
WHERE o.Paid = 1
  AND o.Type IN (N'salon', N'llevar')
  AND o.Status IN (N'nuevo', N'en_cocina', N'listo')
  AND i.KitchenStatus IS NOT NULL
  AND i.KitchenStatus <> N'listo';
GO

UPDATE dbo.Orders
SET Status = N'entregado',
    UpdatedAt = SYSUTCDATETIME()
WHERE Paid = 1
  AND Type IN (N'salon', N'llevar')
  AND Status IN (N'nuevo', N'en_cocina', N'listo');
GO

UPDATE i
SET KitchenStatus = N'listo'
FROM dbo.OrderItems i
INNER JOIN dbo.Orders o ON o.Id = i.OrderId
WHERE o.Status IN (N'entregado', N'cancelado', N'eliminado')
  AND i.KitchenStatus IS NOT NULL
  AND i.KitchenStatus <> N'listo';
GO

UPDATE t
SET Status = N'libre',
    CurrentOrderId = NULL
FROM dbo.Tables t
INNER JOIN dbo.Orders o ON o.Id = t.CurrentOrderId
WHERE o.Status IN (N'entregado', N'cancelado', N'eliminado');
GO
