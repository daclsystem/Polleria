/*
================================================================================
  Admins reales + perfil de sistema oculto
  Login staff = celular + código OTP (WhatsApp). PasswordHash no se usa para entrar.
  Fallback OTP si WhatsApp falla: 123456 (OTP_FALLBACK_CODE)
================================================================================
*/
USE Polleria;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('dbo.Users', 'Dni') IS NULL
  ALTER TABLE dbo.Users ADD Dni NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.Users', 'IsSystem') IS NULL
  ALTER TABLE dbo.Users ADD IsSystem BIT NOT NULL CONSTRAINT DF_Users_IsSystem DEFAULT (0);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UQ_Users_Dni' AND object_id = OBJECT_ID(N'dbo.Users')
)
  CREATE UNIQUE INDEX UQ_Users_Dni ON dbo.Users (Dni) WHERE Dni IS NOT NULL;
GO

IF COL_LENGTH('dbo.Orders', 'CreatedByUserId') IS NOT NULL
  UPDATE dbo.Orders SET CreatedByUserId = NULL WHERE CreatedByUserId IS NOT NULL;
GO

IF COL_LENGTH('dbo.Users', 'ActiveSessionId') IS NOT NULL
  UPDATE dbo.Users SET ActiveSessionId = NULL WHERE ActiveSessionId IS NOT NULL;
GO

DELETE FROM dbo.Users;
GO

/* PasswordHash = marcador; el ingreso real es OTP al teléfono */
INSERT INTO dbo.Users (Name, Email, PasswordHash, Role, Active, Pin, Phone, Dni, IsSystem, PhotoUrl) VALUES
(
  N'Edgar Francisco López Cabrera',
  N'edgarlopezcabrera41@gmail.com',
  N'otp-only',
  N'admin', 1, N'1298', N'980820191', N'71678298', 0,
  N'https://ui-avatars.com/api/?name=Edgar+Francisco&background=e11d2e&color=ffffff&size=128&bold=true'
),
(
  N'Edgar Ortiz López Vega',
  N'SIFRA8@hotmail.com',
  N'otp-only',
  N'admin', 1, N'3820', N'962797752', N'42173820', 0,
  N'https://ui-avatars.com/api/?name=Edgar+Ortiz&background=1a3d1a&color=ffd700&size=128&bold=true'
),
(
  N'Administrador de sistema',
  N'davant101982@gmail.com',
  N'otp-only',
  N'admin', 1, N'1019', N'937493214', N'12345678', 1,
  N'https://ui-avatars.com/api/?name=Sistema&background=111827&color=ffffff&size=128&bold=true'
);
GO

PRINT N'OK: 2 admins visibles + 1 sistema oculto (login = celular + OTP)';
SELECT Name, Email, Role, Phone, Dni, IsSystem, Active FROM dbo.Users ORDER BY IsSystem, Name;
GO
