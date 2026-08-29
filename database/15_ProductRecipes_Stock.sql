/*
================================================================================
  Recetas de producción + movimientos de almacén
  - Cocina: descuenta al “Sacar” o al pasar a en_cocina; puede “Retornar”.
  - Barra / gaseosa (sin cocina): descuenta solo cuando el pedido queda Pagado.
================================================================================
*/
USE Polleria;
GO

/* Ítem ya descontado (evita doble baja) */
IF COL_LENGTH('dbo.OrderItems', 'StockDeducted') IS NULL
BEGIN
  ALTER TABLE dbo.OrderItems ADD StockDeducted BIT NOT NULL
    CONSTRAINT DF_OrderItems_StockDeducted DEFAULT (0);
END
GO

/* Receta: cuánto insumo consume 1 unidad de producto */
IF OBJECT_ID(N'dbo.ProductRecipes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductRecipes (
    Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductRecipes PRIMARY KEY DEFAULT NEWID(),
    ProductId    UNIQUEIDENTIFIER NOT NULL,
    InventoryId  UNIQUEIDENTIFIER NOT NULL,
    QtyPerUnit   DECIMAL(12,4)    NOT NULL,
    Notes        NVARCHAR(120)    NULL,
    CONSTRAINT FK_ProductRecipes_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ProductRecipes_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id),
    CONSTRAINT CK_ProductRecipes_Qty CHECK (QtyPerUnit > 0),
    CONSTRAINT UQ_ProductRecipes UNIQUE (ProductId, InventoryId)
  );
  CREATE INDEX IX_ProductRecipes_Product ON dbo.ProductRecipes (ProductId);
END
GO

/* Kardex / movimientos de inventario */
IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryMovements (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_InventoryMovements PRIMARY KEY DEFAULT NEWID(),
    InventoryId   UNIQUEIDENTIFIER NOT NULL,
    Delta         DECIMAL(12,3)    NOT NULL,
    StockAfter    DECIMAL(12,3)    NOT NULL,
    Reason        NVARCHAR(40)     NOT NULL, -- cocina | ajuste | cancelacion | ingreso
    OrderId       UNIQUEIDENTIFIER NULL,
    OrderItemId   UNIQUEIDENTIFIER NULL,
    Notes         NVARCHAR(255)    NULL,
    CreatedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_InvMov_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_InvMov_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id),
    CONSTRAINT FK_InvMov_Order FOREIGN KEY (OrderId) REFERENCES dbo.Orders(Id) ON DELETE SET NULL
  );
  CREATE INDEX IX_InvMov_Inventory ON dbo.InventoryMovements (InventoryId, CreatedAt DESC);
  CREATE INDEX IX_InvMov_Order ON dbo.InventoryMovements (OrderId);
END
GO

/* Seed recetas por nombre (idempotente) */
DECLARE @pollo UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM dbo.Inventory WHERE Name LIKE N'%Pollo%');
DECLARE @papas UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM dbo.Inventory WHERE Name LIKE N'%Papa%');
DECLARE @arroz UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM dbo.Inventory WHERE Name LIKE N'%Arroz%');
DECLARE @aceite UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM dbo.Inventory WHERE Name LIKE N'%Aceite%');
DECLARE @gaseosa UNIQUEIDENTIFIER = (SELECT TOP 1 Id FROM dbo.Inventory WHERE Name LIKE N'%Gaseosa%' OR Name LIKE N'%Inca%');

/* Combos / pollo */
INSERT INTO dbo.ProductRecipes (ProductId, InventoryId, QtyPerUnit, Notes)
SELECT p.Id, @pollo, CASE
  WHEN p.Name LIKE N'%1/4%' OR p.Name LIKE N'%1/4 %' THEN 0.25
  WHEN p.Name LIKE N'%1/2%' OR p.Name LIKE N'%1/2 %' THEN 0.50
  WHEN p.Name LIKE N'%entero%' OR p.Name LIKE N'%1 entero%' THEN 1.00
  ELSE 0.25
END, N'Pollo por porción'
FROM dbo.Products p
WHERE @pollo IS NOT NULL
  AND (p.Name LIKE N'%pollo%' OR p.Name LIKE N'%Combo%' OR p.Name LIKE N'%brasa%')
  AND p.Name NOT LIKE N'%Chaufa%'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id AND r.InventoryId = @pollo
  );

/* Papas en combos / papas */
INSERT INTO dbo.ProductRecipes (ProductId, InventoryId, QtyPerUnit, Notes)
SELECT p.Id, @papas, CASE WHEN p.Name LIKE N'%Papa%' THEN 0.35 ELSE 0.20 END, N'Papas'
FROM dbo.Products p
WHERE @papas IS NOT NULL
  AND (p.Name LIKE N'%Combo%' OR p.Name LIKE N'%Papa%' OR p.Name LIKE N'%brasa%')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id AND r.InventoryId = @papas
  );

/* Arroz / chaufa */
INSERT INTO dbo.ProductRecipes (ProductId, InventoryId, QtyPerUnit, Notes)
SELECT p.Id, @arroz, 0.25, N'Arroz / chaufa'
FROM dbo.Products p
WHERE @arroz IS NOT NULL
  AND (p.Name LIKE N'%Chaufa%' OR p.Name LIKE N'%Arroz%' OR p.Name LIKE N'%Aeropuerto%')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id AND r.InventoryId = @arroz
  );

/* Aceite (fritura) */
INSERT INTO dbo.ProductRecipes (ProductId, InventoryId, QtyPerUnit, Notes)
SELECT p.Id, @aceite, 0.05, N'Aceite cocina'
FROM dbo.Products p
WHERE @aceite IS NOT NULL
  AND (p.Name LIKE N'%Combo%' OR p.Name LIKE N'%Papa%' OR p.Name LIKE N'%Chaufa%' OR p.Name LIKE N'%frit%')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id AND r.InventoryId = @aceite
  );

/* Gaseosas */
INSERT INTO dbo.ProductRecipes (ProductId, InventoryId, QtyPerUnit, Notes)
SELECT p.Id, @gaseosa, 1, N'Bebida'
FROM dbo.Products p
WHERE @gaseosa IS NOT NULL
  AND (p.Name LIKE N'%Inca%' OR p.Name LIKE N'%Coca%' OR p.Name LIKE N'%Gaseosa%')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ProductRecipes r WHERE r.ProductId = p.Id AND r.InventoryId = @gaseosa
  );

PRINT N'OK: ProductRecipes + InventoryMovements listos';
GO
