USE Polleria;
GO

IF COL_LENGTH('dbo.Users', 'ActiveSessionId') IS NULL
  ALTER TABLE dbo.Users ADD ActiveSessionId UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH('dbo.Customers', 'ActiveSessionId') IS NULL
  ALTER TABLE dbo.Customers ADD ActiveSessionId UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH('dbo.Drivers', 'ActiveSessionId') IS NULL
  ALTER TABLE dbo.Drivers ADD ActiveSessionId UNIQUEIDENTIFIER NULL;
GO

PRINT N'OK: ActiveSessionId (sesión única por cuenta)';
GO
