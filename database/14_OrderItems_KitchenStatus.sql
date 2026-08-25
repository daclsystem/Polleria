-- Rondas de cocina por ítem (adicionales sin reiniciar toda la comanda)
IF COL_LENGTH('dbo.OrderItems', 'KitchenStatus') IS NULL
BEGIN
  ALTER TABLE dbo.OrderItems ADD KitchenStatus NVARCHAR(20) NULL;
  -- pendiente | en_cocina | listo | NULL (NULL = no va a cocina / barra)
END
GO

-- Ítems de pedidos activos: si aún no tienen estado, marcar pendientes los de prep
UPDATE oi
SET oi.KitchenStatus = N'pendiente'
FROM dbo.OrderItems oi
INNER JOIN dbo.Orders o ON o.Id = oi.OrderId
LEFT JOIN dbo.Products p ON p.Id = oi.ProductId
WHERE oi.KitchenStatus IS NULL
  AND o.Status IN (N'nuevo', N'en_cocina', N'listo')
  AND (
    p.SendToKitchen = 1
    OR (p.Id IS NULL AND oi.Name NOT LIKE N'%delivery%' AND oi.Name NOT LIKE N'%bebida%' AND oi.Name NOT LIKE N'%gaseosa%')
  );
GO

-- Pedidos en cocina: ítems de prep → en_cocina
UPDATE oi
SET oi.KitchenStatus = N'en_cocina'
FROM dbo.OrderItems oi
INNER JOIN dbo.Orders o ON o.Id = oi.OrderId
WHERE o.Status = N'en_cocina'
  AND oi.KitchenStatus = N'pendiente';
GO

-- Pedidos listos: ítems de prep → listo
UPDATE oi
SET oi.KitchenStatus = N'listo'
FROM dbo.OrderItems oi
INNER JOIN dbo.Orders o ON o.Id = oi.OrderId
WHERE o.Status = N'listo'
  AND oi.KitchenStatus IN (N'pendiente', N'en_cocina');
GO

PRINT N'OK: OrderItems.KitchenStatus';
GO
