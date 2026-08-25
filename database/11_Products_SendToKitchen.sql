USE Polleria;
GO

IF COL_LENGTH('dbo.Products', 'SendToKitchen') IS NULL
  ALTER TABLE dbo.Products ADD SendToKitchen BIT NOT NULL
    CONSTRAINT DF_Products_SendToKitchen DEFAULT (1);
GO

-- Bebidas / gaseosas: no van a cocina por defecto
UPDATE dbo.Products
SET SendToKitchen = 0
WHERE SendToKitchen = 1
  AND (
    Category LIKE N'%Bebida%'
    OR Category LIKE N'%Gaseosa%'
    OR Name LIKE N'%Inca Kola%'
    OR Name LIKE N'%Coca%'
    OR Name LIKE N'%Chicha%'
  );
GO

PRINT N'OK: Products.SendToKitchen (preparación vs barra)';
GO
