/*
  Precio de venta del insumo (además del costo).
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Inventory', 'SalePrice') IS NULL
BEGIN
  ALTER TABLE dbo.Inventory ADD SalePrice DECIMAL(10,2) NOT NULL
    CONSTRAINT DF_Inventory_SalePrice DEFAULT (0);
END
GO
