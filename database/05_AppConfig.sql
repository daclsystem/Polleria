/*
  AppConfig — JSON key/value para configs del front (WhatsApp, banners, SUNAT, etc.)
*/
USE Polleria;
GO

IF OBJECT_ID(N'dbo.AppConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppConfig (
    ConfigKey   NVARCHAR(80)  NOT NULL CONSTRAINT PK_AppConfig PRIMARY KEY,
    ConfigValue NVARCHAR(MAX) NOT NULL,
    UpdatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_AppConfig_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
END
GO

IF COL_LENGTH('dbo.Products','ImageUrl') IS NULL
  ALTER TABLE dbo.Products ADD ImageUrl NVARCHAR(500) NULL;
GO

IF COL_LENGTH('dbo.Users','Phone') IS NULL
  ALTER TABLE dbo.Users ADD Phone NVARCHAR(40) NULL;
GO

PRINT N'OK: AppConfig listo';
GO
