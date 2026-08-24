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

-- Seed demo conductor (mismo celular admin para pruebas locales — cámbialo en prod)
IF NOT EXISTS (SELECT 1 FROM dbo.Drivers)
BEGIN
  INSERT INTO dbo.Drivers (Id, Name, Phone, Active, VehicleInfo)
  VALUES (NEWID(), N'Conductor Demo', N'51962797752', 1, N'Moto');
END
GO

-- Asegurar teléfonos staff
UPDATE dbo.Users SET Phone = N'51962797752' WHERE Email = N'admin@lopez.pe' AND (Phone IS NULL OR Phone = N'');
UPDATE dbo.Users SET Phone = N'51911111111' WHERE Email = N'cajero@lopez.pe' AND (Phone IS NULL OR Phone = N'');
UPDATE dbo.Users SET Phone = N'51922222222' WHERE Email = N'cocina@lopez.pe' AND (Phone IS NULL OR Phone = N'');
UPDATE dbo.Users SET Phone = N'51933333333' WHERE Email = N'mozo@lopez.pe' AND (Phone IS NULL OR Phone = N'');
GO

PRINT N'OK: Drivers + OTP driver';
GO
