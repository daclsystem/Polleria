USE Polleria;
GO

-- Foto + DriverId (idempotente)
IF COL_LENGTH('dbo.Customers', 'PhotoUrl') IS NULL
  ALTER TABLE dbo.Customers ADD PhotoUrl NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.Drivers', 'PhotoUrl') IS NULL
  ALTER TABLE dbo.Drivers ADD PhotoUrl NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.Orders', 'DriverId') IS NULL
  ALTER TABLE dbo.Orders ADD DriverId UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('dbo.Orders', 'DriverAssignedAt') IS NULL
  ALTER TABLE dbo.Orders ADD DriverAssignedAt DATETIME2(0) NULL;
GO

-- 1) Cliente demo en sección Clientes
IF NOT EXISTS (
  SELECT 1 FROM dbo.Customers
  WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE N'%937493214'
)
BEGIN
  INSERT INTO dbo.Customers (Id, Name, Phone, Email, Address, PasswordHash, PhotoUrl)
  VALUES (
    NEWID(),
    N'María López',
    N'51937493214',
    N'maria@ejemplo.pe',
    N'Av. Principal 123',
    N'$2b$08$seedplaceholderhashxxxxxxxxxxxxxxxxxxxxxxx',
    N'https://ui-avatars.com/api/?name=Maria+Lopez&background=1a3d1a&color=ffd700&size=128&bold=true'
  );
END
ELSE
BEGIN
  UPDATE dbo.Customers
  SET Name = N'María López',
      PhotoUrl = ISNULL(PhotoUrl, N'https://ui-avatars.com/api/?name=Maria+Lopez&background=1a3d1a&color=ffd700&size=128&bold=true'),
      Address = ISNULL(Address, N'Av. Principal 123')
  WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE N'%937493214';
END
GO

-- 2) Conductor demo (celular de prueba 11111 — sin número real)
IF NOT EXISTS (SELECT 1 FROM dbo.Drivers WHERE Phone = N'11111')
BEGIN
  INSERT INTO dbo.Drivers (Id, Name, Phone, Active, VehicleInfo, PhotoUrl)
  VALUES (
    NEWID(),
    N'Carlos Repartidor',
    N'11111',
    1,
    N'Moto · ABC-123',
    N'https://ui-avatars.com/api/?name=Carlos+Repartidor&background=0f766e&color=ffffff&size=128&bold=true'
  );
END
ELSE
BEGIN
  UPDATE dbo.Drivers
  SET Name = N'Carlos Repartidor',
      Active = 1,
      VehicleInfo = ISNULL(VehicleInfo, N'Moto · ABC-123'),
      PhotoUrl = ISNULL(PhotoUrl, N'https://ui-avatars.com/api/?name=Carlos+Repartidor&background=0f766e&color=ffffff&size=128&bold=true')
  WHERE Phone = N'11111';
END
GO

-- Quitar celulares reales de demo si quedaron
UPDATE dbo.Drivers
SET Phone = N'11111'
WHERE REPLACE(REPLACE(REPLACE(Phone,' ',''),'-',''),'+','') LIKE N'%962797752';
GO

PRINT N'OK: 1 cliente + 1 conductor listos';
GO
