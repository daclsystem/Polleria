/*
  Borra solo pedidos (conserva clientes, carta, usuarios, inventario).
*/
USE Polleria;
GO
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NOT NULL DELETE FROM dbo.InventoryMovements;
IF OBJECT_ID(N'dbo.CouponRedemptions', N'U') IS NOT NULL DELETE FROM dbo.CouponRedemptions;
IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NOT NULL DELETE FROM dbo.ProductReviews;
IF OBJECT_ID(N'dbo.OrderPayments', N'U') IS NOT NULL DELETE FROM dbo.OrderPayments;
IF OBJECT_ID(N'dbo.OrderItemOptions', N'U') IS NOT NULL DELETE FROM dbo.OrderItemOptions;
IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NOT NULL DELETE FROM dbo.OrderItems;
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL DELETE FROM dbo.Orders;

IF OBJECT_ID(N'dbo.Tables', N'U') IS NOT NULL
  UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL;

IF COL_LENGTH('dbo.Settings', 'NextOrderNumber') IS NOT NULL
  UPDATE dbo.Settings SET NextOrderNumber = 1001 WHERE Id = 1;

PRINT N'OK: pedidos borrados, mesas libres, NextOrderNumber=1001';
GO
