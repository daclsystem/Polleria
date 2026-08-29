/*
  Conductores (drivers) + OTP accountType driver
*/
USE Polleria;
GO

IF OBJECT_ID(N'dbo.Drivers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Drivers (
    Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Drivers PRIMARY KEY DEFAULT NEWID(),
    Name         NVARCHAR(120)    NOT NULL,
    Phone        NVARCHAR(40)     NOT NULL,
    Active       BIT              NOT NULL CONSTRAINT DF_Drivers_Active DEFAULT (1),
    VehicleInfo  NVARCHAR(120)    NULL,
    Lat          DECIMAL(10,7)    NULL,
    Lng          DECIMAL(10,7)    NULL,
    CreatedAt    DATETIME2(0)     NOT NULL CONSTRAINT DF_Drivers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt    DATETIME2(0)     NOT NULL CONSTRAINT DF_Drivers_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Drivers_Phone UNIQUE (Phone)
  );
  CREATE INDEX IX_Drivers_Active ON dbo.Drivers (Active, Name);
END
GO

-- Ampliar AuthOtpCodes para driver
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_AuthOtp_Type' AND parent_object_id = OBJECT_ID(N'dbo.AuthOtpCodes')
)
BEGIN
  ALTER TABLE dbo.AuthOtpCodes DROP CONSTRAINT CK_AuthOtp_Type;
END
GO

ALTER TABLE dbo.AuthOtpCodes WITH NOCHECK
  ADD CONSTRAINT CK_AuthOtp_Type CHECK (AccountType IN (N'staff', N'customer', N'driver'));
GO

-- Seed demo conductor (celular de prueba 11111 — NUNCA número real)
IF NOT EXISTS (SELECT 1 FROM dbo.Drivers WHERE Phone = N'11111')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.Drivers)
    INSERT INTO dbo.Drivers (Id, Name, Phone, Active, VehicleInfo)
    VALUES (NEWID(), N'Carlos Repartidor', N'11111', 1, N'Moto');
  ELSE
    UPDATE TOP (1) dbo.Drivers SET Phone = N'11111', Active = 1 WHERE Active = 1;
END
GO

-- Asegurar teléfonos staff
UPDATE dbo.Users SET Phone = N'9999999' WHERE Email = N'admin@lopez.pe';
UPDATE dbo.Users SET Phone = N'88888' WHERE Email = N'cajero@lopez.pe';
UPDATE dbo.Users SET Phone = N'77777' WHERE Email = N'cocina@lopez.pe';
UPDATE dbo.Users SET Phone = N'66666' WHERE Email = N'mozo@lopez.pe';
UPDATE dbo.Users SET Phone = N'55555' WHERE Email = N'mozo2@lopez.pe';
GO

PRINT N'OK: Drivers + OTP driver';
GO
