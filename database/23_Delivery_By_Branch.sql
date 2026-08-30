/*
================================================================================
  Origen delivery (Chocos Imperial) + rangos por sede
  0–4 km = S/ 3 · 4–6 = S/ 6 · 6–8 = S/ 9 · y así
  Ejecutar en BD ya existente.
================================================================================
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.DeliveryRanges', 'BranchId') IS NULL
BEGIN
  ALTER TABLE dbo.DeliveryRanges ADD BranchId UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_DeliveryRanges_Branch' AND object_id = OBJECT_ID(N'dbo.DeliveryRanges')
)
BEGIN
  CREATE INDEX IX_DeliveryRanges_Branch ON dbo.DeliveryRanges (BranchId, Active, SortOrder);
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = N'FK_DeliveryRanges_Branch'
)
BEGIN
  ALTER TABLE dbo.DeliveryRanges
    ADD CONSTRAINT FK_DeliveryRanges_Branch
    FOREIGN KEY (BranchId) REFERENCES dbo.Branches(Id);
END
GO

/* Origen principal: https://maps.app.goo.gl/jUTXdLKmq7w3rXXv5 */
UPDATE dbo.Settings
SET
  OriginLat = -13.0643530,
  OriginLng = -76.3489460,
  Address   = N'Chocos Imperial, Cañete',
  DeliveryFee = 3.00,
  UpdatedAt = SYSUTCDATETIME()
WHERE Id = 1;
GO

UPDATE dbo.Branches
SET
  Lat     = -13.0643530,
  Lng     = -76.3489460,
  Address = N'Chocos Imperial, Cañete'
WHERE Id = (SELECT TOP 1 Id FROM dbo.Branches ORDER BY CreatedAt);
GO

/* Tarifas de prueba (globales). Cada sede puede sobreescribirlas en el sistema. */
DELETE FROM dbo.DeliveryRanges WHERE BranchId IS NULL;
INSERT INTO dbo.DeliveryRanges (Name, DistanceKmFrom, DistanceKmTo, Fee, SortOrder, Active) VALUES
  (N'0 a 4 km',            0,     4,  3.00, 1, 1),
  (N'4 a 6 km',            4,     6,  6.00, 2, 1),
  (N'6 a 8 km',            6,     8,  9.00, 3, 1),
  (N'8 a 10 km',           8,    10, 12.00, 4, 1),
  (N'10 a 12 km',         10,    12, 15.00, 5, 1),
  (N'Fuera de cobertura', 12,  NULL,  0.00, 6, 0);
GO
