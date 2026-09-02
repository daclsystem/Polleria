/*
  Productos cuantificables + columnas de documento en pedidos (boleta/factura).
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Products', 'Cuantificable') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD Cuantificable BIT NOT NULL
    CONSTRAINT DF_Products_Cuantificable DEFAULT (0);
END
GO

IF OBJECT_ID(N'dbo.ProductRecipes', N'U') IS NOT NULL
BEGIN
  UPDATE p
  SET p.Cuantificable = 1
  FROM dbo.Products p
  WHERE EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id
  )
    AND ISNULL(p.Cuantificable, 0) = 0;
END
GO

IF COL_LENGTH('dbo.Orders', 'DocTipo') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocTipo NVARCHAR(20) NULL;
END
GO
IF COL_LENGTH('dbo.Orders', 'DocNumero') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocNumero NVARCHAR(20) NULL;
END
GO
IF COL_LENGTH('dbo.Orders', 'DocNombre') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocNombre NVARCHAR(160) NULL;
END
GO
IF COL_LENGTH('dbo.Orders', 'DocEmail') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocEmail NVARCHAR(120) NULL;
END
GO
IF COL_LENGTH('dbo.Orders', 'DocPhone') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocPhone NVARCHAR(30) NULL;
END
GO
IF COL_LENGTH('dbo.Orders', 'DocAddress') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DocAddress NVARCHAR(200) NULL;
END
GO
