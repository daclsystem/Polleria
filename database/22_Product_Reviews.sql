/* Product reviews / calificaciones de clientes */
IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductReviews (
    Id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductReviews PRIMARY KEY DEFAULT NEWID(),
    ProductId   UNIQUEIDENTIFIER NOT NULL,
    CustomerId  UNIQUEIDENTIFIER NULL,
    CustomerName NVARCHAR(120)   NOT NULL,
    Stars       TINYINT          NOT NULL,
    Comment     NVARCHAR(500)    NULL,
    OrderId     UNIQUEIDENTIFIER NULL,
    CreatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ProductReviews_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ProductReviews_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id) ON DELETE CASCADE,
    CONSTRAINT CK_ProductReviews_Stars CHECK (Stars BETWEEN 1 AND 5)
  );
  CREATE INDEX IX_ProductReviews_Product ON dbo.ProductReviews (ProductId, CreatedAt DESC);
END
GO
