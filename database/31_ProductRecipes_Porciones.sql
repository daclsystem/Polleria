/*
  Tablas de receta y kardex. Vacías a propósito:
  la receta de cada plato se arma en Carta (system).
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.OrderItems', 'StockDeducted') IS NULL
BEGIN
  ALTER TABLE dbo.OrderItems ADD StockDeducted BIT NOT NULL
    CONSTRAINT DF_OrderItems_StockDeducted DEFAULT (0);
END
GO

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

IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryMovements (
    Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_InvMov PRIMARY KEY DEFAULT NEWID(),
    InventoryId     UNIQUEIDENTIFIER NOT NULL,
    Delta           DECIMAL(12,3)    NOT NULL,
    StockAfter      DECIMAL(12,3)    NOT NULL,
    Reason          NVARCHAR(40)     NOT NULL,
    OrderId         UNIQUEIDENTIFIER NULL,
    OrderItemId     UNIQUEIDENTIFIER NULL,
    Notes           NVARCHAR(255)    NULL,
    CreatedAt       DATETIME2(0)     NOT NULL CONSTRAINT DF_InvMov_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_InvMov_Inventory FOREIGN KEY (InventoryId) REFERENCES dbo.Inventory(Id)
  );
  CREATE INDEX IX_InvMov_Inventory ON dbo.InventoryMovements (InventoryId, CreatedAt DESC);
END
GO
