/*
================================================================================
  Limpieza de pedidos para pruebas (conserva catálogo, usuarios, inventario base)
================================================================================
*/
USE Polleria;
GO

SET NOCOUNT ON;

UPDATE dbo.Tables
SET Status = N'libre', CurrentOrderId = NULL
WHERE CurrentOrderId IS NOT NULL OR Status <> N'libre';

IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NOT NULL
  DELETE FROM dbo.InventoryMovements;

DELETE FROM dbo.Orders;

UPDATE dbo.Settings SET NextOrderNumber = 1001;

PRINT N'OK: pedidos limpiados, mesas libres, NextOrderNumber=1001';
GO
