/*
  Cierre de caja: turno desde el último cierre (o medianoche Lima).
*/
USE Polleria;
GO

IF OBJECT_ID(N'dbo.CashCloses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CashCloses (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CashCloses PRIMARY KEY DEFAULT NEWID(),
    FromAt        DATETIME2(0)     NOT NULL,
    ClosedAt      DATETIME2(0)     NOT NULL CONSTRAINT DF_CashCloses_ClosedAt DEFAULT SYSUTCDATETIME(),
    UserId        UNIQUEIDENTIFIER NULL,
    OrdersCount   INT              NOT NULL CONSTRAINT DF_CashCloses_Orders DEFAULT (0),
    SalesTotal    DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Sales DEFAULT (0),
    Efectivo      DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Ef DEFAULT (0),
    Yape          DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Yp DEFAULT (0),
    Tarjeta       DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Tj DEFAULT (0),
    CountedCash   DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Cnt DEFAULT (0),
    Difference    DECIMAL(12,2)    NOT NULL CONSTRAINT DF_CashCloses_Diff DEFAULT (0),
    Notes         NVARCHAR(255)    NULL
  );
  CREATE INDEX IX_CashCloses_ClosedAt ON dbo.CashCloses (ClosedAt DESC);
END
GO

IF COL_LENGTH(N'dbo.CashCloses', N'Signature') IS NULL
  ALTER TABLE dbo.CashCloses ADD Signature NVARCHAR(MAX) NULL;
GO
