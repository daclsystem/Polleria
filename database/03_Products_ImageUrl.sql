/*
  MinIO / multimedia — columna imagen en productos
  Ejecutar en BD Polleria (VPS o local)
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Products', 'ImageUrl') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD ImageUrl NVARCHAR(500) NULL;
END
GO

PRINT N'OK: Products.ImageUrl';
GO
