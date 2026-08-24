/*
  Auth recovery OTP + teléfono en usuarios staff
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Users', 'Phone') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD Phone NVARCHAR(40) NULL;
END
GO

IF OBJECT_ID(N'dbo.AuthOtpCodes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuthOtpCodes (
    Id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AuthOtpCodes PRIMARY KEY DEFAULT NEWID(),
    AccountType NVARCHAR(20)     NOT NULL, -- staff | customer
    Identifier  NVARCHAR(180)    NOT NULL, -- email o phone normalizado
    Phone       NVARCHAR(40)     NOT NULL,
    CodeHash    NVARCHAR(255)    NOT NULL,
    ExpiresAt   DATETIME2(0)     NOT NULL,
    UsedAt      DATETIME2(0)     NULL,
    CreatedAt   DATETIME2(0)     NOT NULL CONSTRAINT DF_AuthOtp_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_AuthOtp_Type CHECK (AccountType IN (N'staff', N'customer'))
  );
  CREATE INDEX IX_AuthOtp_Lookup ON dbo.AuthOtpCodes (AccountType, Identifier, ExpiresAt);
END
GO

-- Teléfonos demo staff (ajusta en producción)
UPDATE dbo.Users SET Phone = N'51962797752' WHERE Email = N'admin@lopez.pe' AND Phone IS NULL;
UPDATE dbo.Users SET Phone = N'51911111111' WHERE Email = N'cajero@lopez.pe' AND Phone IS NULL;
UPDATE dbo.Users SET Phone = N'51922222222' WHERE Email = N'cocina@lopez.pe' AND Phone IS NULL;
UPDATE dbo.Users SET Phone = N'51933333333' WHERE Email = N'mozo@lopez.pe' AND Phone IS NULL;
GO

PRINT N'OK: Auth OTP + Users.Phone';
GO
