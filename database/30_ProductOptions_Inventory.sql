/*
  Enlaza una opción de carta (ej. gaseosa) a un insumo.
  Al cobrar en caja se descuenta QtyPerUnit × cantidad del pedido.
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.ProductOptions', 'InventoryId') IS NULL
BEGIN
  ALTER TABLE dbo.ProductOptions ADD InventoryId UNIQUEIDENTIFIER NULL;
END
GO

IF COL_LENGTH('dbo.ProductOptions', 'QtyPerUnit') IS NULL
BEGIN
  ALTER TABLE dbo.ProductOptions ADD QtyPerUnit DECIMAL(12,4) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PO_Inventory')
  AND COL_LENGTH('dbo.ProductOptions', 'InventoryId') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ProductOptions WITH NOCHECK
    ADD CONSTRAINT FK_PO_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id);
END
GO
