USE Polleria;
GO

IF COL_LENGTH('dbo.Orders', 'DriverId') IS NULL
  ALTER TABLE dbo.Orders ADD DriverId UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH('dbo.Orders', 'DriverAssignedAt') IS NULL
  ALTER TABLE dbo.Orders ADD DriverAssignedAt DATETIME2(0) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_DriverId' AND object_id = OBJECT_ID(N'dbo.Orders')
)
  CREATE INDEX IX_Orders_DriverId ON dbo.Orders (DriverId, Status);
GO

PRINT N'OK: Orders.DriverId para ruteo delivery';
GO
