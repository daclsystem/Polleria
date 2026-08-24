USE Polleria;
GO

IF COL_LENGTH('dbo.Customers', 'PhotoUrl') IS NULL
  ALTER TABLE dbo.Customers ADD PhotoUrl NVARCHAR(500) NULL;
GO

IF COL_LENGTH('dbo.Drivers', 'PhotoUrl') IS NULL
  ALTER TABLE dbo.Drivers ADD PhotoUrl NVARCHAR(500) NULL;
GO

PRINT N'OK: PhotoUrl clientes/conductores';
GO
