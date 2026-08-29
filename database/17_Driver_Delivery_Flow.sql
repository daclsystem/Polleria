/*
================================================================================
  Flujo repartidor: Ubicado → Entregado (foto) → Liquidación en base
================================================================================
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Orders', 'DriverArrivedAt') IS NULL
  ALTER TABLE dbo.Orders ADD DriverArrivedAt DATETIME2(0) NULL;
GO

IF COL_LENGTH('dbo.Orders', 'DeliveryPhotoUrl') IS NULL
  ALTER TABLE dbo.Orders ADD DeliveryPhotoUrl NVARCHAR(500) NULL;
GO

IF COL_LENGTH('dbo.Orders', 'DriverCollectedMethod') IS NULL
  ALTER TABLE dbo.Orders ADD DriverCollectedMethod NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.Orders', 'DriverCollectedAmount') IS NULL
  ALTER TABLE dbo.Orders ADD DriverCollectedAmount DECIMAL(10, 2) NULL;
GO

IF COL_LENGTH('dbo.Orders', 'DriverSettledAt') IS NULL
  ALTER TABLE dbo.Orders ADD DriverSettledAt DATETIME2(0) NULL;
GO

PRINT N'OK: DriverArrivedAt / DeliveryPhotoUrl / liquidación en base';
GO
