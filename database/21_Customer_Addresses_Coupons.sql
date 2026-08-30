-- Direcciones favoritas del cliente + cuponera de descuentos.
-- Ejecutar en SQL Server (BD Polleria).

IF OBJECT_ID(N'dbo.CustomerAddresses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CustomerAddresses (
    Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CustomerAddresses PRIMARY KEY DEFAULT NEWID(),
    CustomerId UNIQUEIDENTIFIER NOT NULL,
    Label      NVARCHAR(80)     NOT NULL,
    Address    NVARCHAR(255)    NOT NULL,
    Lat        DECIMAL(10,7)    NULL,
    Lng        DECIMAL(10,7)    NULL,
    IsDefault  BIT              NOT NULL CONSTRAINT DF_CustomerAddresses_IsDefault DEFAULT (0),
    CreatedAt  DATETIME2(0)     NOT NULL CONSTRAINT DF_CustomerAddresses_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_CustomerAddresses_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id) ON DELETE CASCADE
  );
  CREATE INDEX IX_CustomerAddresses_Customer ON dbo.CustomerAddresses(CustomerId);
END
GO

IF OBJECT_ID(N'dbo.Coupons', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Coupons (
    Id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Coupons PRIMARY KEY DEFAULT NEWID(),
    Code               NVARCHAR(40)     NOT NULL,
    Title              NVARCHAR(120)    NOT NULL,
    Description        NVARCHAR(400)    NULL,
    DiscountType       NVARCHAR(20)     NOT NULL, -- percent | fixed
    DiscountValue      DECIMAL(10,2)    NOT NULL,
    MinSubtotal        DECIMAL(10,2)    NOT NULL CONSTRAINT DF_Coupons_MinSubtotal DEFAULT (0),
    MaxDiscount        DECIMAL(10,2)    NULL,
    StartsAt           DATETIME2(0)     NULL,
    EndsAt             DATETIME2(0)     NULL,
    MaxUsesTotal       INT              NULL,
    MaxUsesPerCustomer INT              NOT NULL CONSTRAINT DF_Coupons_MaxPerCust DEFAULT (1),
    UsedCount          INT              NOT NULL CONSTRAINT DF_Coupons_UsedCount DEFAULT (0),
    Active             BIT              NOT NULL CONSTRAINT DF_Coupons_Active DEFAULT (1),
    CreatedAt          DATETIME2(0)     NOT NULL CONSTRAINT DF_Coupons_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Coupons_Code UNIQUE (Code)
  );
END
GO

IF OBJECT_ID(N'dbo.CouponRedemptions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CouponRedemptions (
    Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CouponRedemptions PRIMARY KEY DEFAULT NEWID(),
    CouponId   UNIQUEIDENTIFIER NOT NULL,
    CustomerId UNIQUEIDENTIFIER NULL,
    OrderId    UNIQUEIDENTIFIER NULL,
    Discount   DECIMAL(10,2)    NOT NULL,
    UsedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_CouponRedemptions_UsedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_CouponRedemptions_Coupon FOREIGN KEY (CouponId) REFERENCES dbo.Coupons(Id),
    CONSTRAINT FK_CouponRedemptions_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id),
    CONSTRAINT FK_CouponRedemptions_Order FOREIGN KEY (OrderId) REFERENCES dbo.Orders(Id)
  );
  CREATE INDEX IX_CouponRedemptions_Coupon ON dbo.CouponRedemptions(CouponId);
  CREATE INDEX IX_CouponRedemptions_Customer ON dbo.CouponRedemptions(CustomerId);
END
GO

IF COL_LENGTH('dbo.Orders', 'CouponCode') IS NULL
  ALTER TABLE dbo.Orders ADD CouponCode NVARCHAR(40) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Coupons)
BEGIN
  INSERT INTO dbo.Coupons (Code, Title, Description, DiscountType, DiscountValue, MinSubtotal, MaxDiscount, MaxUsesPerCustomer, Active)
  VALUES
    (N'BIENVENIDO10', N'10% de bienvenida', N'Descuento del 10% en tu primer pedido (máx. S/ 15).', N'percent', 10, 30, 15, 1, 1),
    (N'POLLO5', N'S/ 5 de descuento', N'S/ 5 off en pedidos desde S/ 40.', N'fixed', 5, 40, NULL, 3, 1);
END
GO

PRINT N'OK: CustomerAddresses + Coupons listos';
GO
