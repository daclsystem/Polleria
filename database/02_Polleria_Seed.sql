/*
================================================================================
  Chifa-Pollería Lopez — seed inicial
  Ejecutar DESPUÉS de 01_Polleria_Create.sql
================================================================================
*/

USE Polleria;
GO

/* Settings */
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE Id = 1)
BEGIN
  INSERT INTO dbo.Settings (
    Id, Name, Slogan, Address, Phone, Ruc, IgvRate, Hours,
    OriginLat, OriginLng, GeoRouteApiUrl, GeoRouteToken, WhatsAppNumber, NextOrderNumber
  ) VALUES (
    1,
    N'Chifa-Pollería Lopez',
    N'El mejor pollo a la brasa del sur',
    N'Av. Principal 123, Lima',
    N'962797752',
    N'20123456789',
    0.18,
    N'Lun–Dom 11:00–23:00',
    -12.10001777,   -- ajustar a la ubicación real del local
    -76.9381774,
    N'https://geo.taximonterrico.com/api/v3/route/{fromLat},{fromLng}/{toLat},{toLng}/-1/{token}',
    N'demo',
    N'51962797752',
    1001
  );
END
GO

/* Rangos delivery administrables */
IF NOT EXISTS (SELECT 1 FROM dbo.DeliveryRanges)
BEGIN
  INSERT INTO dbo.DeliveryRanges (Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder) VALUES
  (N'Zona cercana',  0,  3,  5.00, 1),
  (N'Zona media',    3,  6,  8.00, 2),
  (N'Zona lejana',   6, 10, 12.00, 3),
  (N'Fuera de cobertura', 10, NULL, 0.00, 4); -- Fee 0 + Active: el API debe rechazar si Fee=0 y To IS NULL (cobertura)
END
GO

/* Marcar último rango como inactivo para “fuera de cobertura” (API valida Active=1 y Fee>0) */
UPDATE dbo.DeliveryRanges
SET Active = 0
WHERE Name = N'Fuera de cobertura';
GO

/* Usuarios demo — PasswordHash = texto plano SOLO para demo; el API debe hashear (bcrypt) */
/* En producción el API re-hashea al primer login o usa estos hashes bcrypt generados aparte */
IF NOT EXISTS (SELECT 1 FROM dbo.Users)
BEGIN
  INSERT INTO dbo.Users (Name, Email, PasswordHash, Role, Active, Pin) VALUES
  (N'Administrador', N'admin@lopez.pe',  N'admin123',  N'admin',  1, N'1234'),
  (N'Cajero',        N'cajero@lopez.pe', N'cajero123', N'cajero', 1, N'2222'),
  (N'Cocina',        N'cocina@lopez.pe', N'cocina123', N'cocina', 1, N'3333'),
  (N'Mozo',          N'mozo@lopez.pe',   N'mozo123',   N'mozo',   1, N'4444');
END
GO

/* Sucursal */
IF NOT EXISTS (SELECT 1 FROM dbo.Branches)
BEGIN
  INSERT INTO dbo.Branches (Name, Address, Phone, Lat, Lng, Active) VALUES
  (N'Local Principal', N'Av. Principal 123, Lima', N'962797752', -12.10001777, -76.9381774, 1);
END
GO

/* Mesas */
IF NOT EXISTS (SELECT 1 FROM dbo.Tables)
BEGIN
  DECLARE @i INT = 1;
  WHILE @i <= 12
  BEGIN
    INSERT INTO dbo.Tables (Number, Seats, Zone, Status)
    VALUES (@i, CASE WHEN @i <= 4 THEN 2 WHEN @i <= 8 THEN 4 ELSE 6 END,
            CASE WHEN @i <= 6 THEN N'Salón' ELSE N'Terrazas' END, N'libre');
    SET @i += 1;
  END
END
GO

/* Impresoras */
IF NOT EXISTS (SELECT 1 FROM dbo.Printers)
BEGIN
  INSERT INTO dbo.Printers (RoleKey, Label, Driver, Enabled, Cols) VALUES
  (N'caja',   N'Ticketera caja',   N'browser', 1, 48),
  (N'cocina', N'Ticketera cocina', N'browser', 1, 48);
END
GO

/* WhatsApp */
IF NOT EXISTS (SELECT 1 FROM dbo.WhatsAppConfig WHERE Id = 1)
BEGIN
  INSERT INTO dbo.WhatsAppConfig (
    Id, Provider, PhoneNumber, Enabled, NotifyOnNewOrder,
    TemplatePedidoRecibido, TemplatePedidoListo, TemplatePedidoEnCamino
  ) VALUES (
    1, N'directo', N'51962797752', 1, 1,
    N'¡Hola {nombre}! Tu pedido #{numero} ha sido recibido. Total: {total}. Pago: {pago}.',
    N'¡{nombre}! Tu pedido #{numero} está LISTO.',
    N'🛵 ¡{nombre}! Tu pedido #{numero} va en camino a {direccion}.'
  );
END
GO

/* Inventario básico */
IF NOT EXISTS (SELECT 1 FROM dbo.Inventory)
BEGIN
  INSERT INTO dbo.Inventory (Name, Unit, Stock, MinStock, Cost) VALUES
  (N'Pollo entero', N'und', 40, 10, 18.00),
  (N'Papas',        N'kg',  50, 15,  3.50),
  (N'Arroz',        N'kg',  30, 10,  4.00),
  (N'Aceite',       N'lt',  20,  5,  8.00),
  (N'Gaseosa 1.5L', N'und', 48, 12,  5.50);
END
GO

PRINT N'OK: seed aplicado';
GO
