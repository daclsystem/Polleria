/*
================================================================================
  Chifa-Pollería Lopez — SQL Server
  Script: crear base de datos + tablas + índices + seed mínimo
================================================================================
  Cómo ejecutarlo:
  1. Abre SQL Server Management Studio (SSMS) o Azure Data Studio
  2. Conéctate a tu instancia (local, VPS o hosting)
  3. Abre este archivo y ejecuta (F5) completo
  4. Verifica: USE Polleria; SELECT name FROM sys.tables;
================================================================================
*/

IF DB_ID(N'Polleria') IS NULL
BEGIN
  CREATE DATABASE Polleria;
END
GO

USE Polleria;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* -------------------------------------------------------------------------- */
/* Limpieza opcional (solo si quieres recrear desde cero)                     */
/* -------------------------------------------------------------------------- */
/*
DROP TABLE IF EXISTS dbo.OrderItemOptions;
DROP TABLE IF EXISTS dbo.OrderItems;
DROP TABLE IF EXISTS dbo.OrderPayments;
DROP TABLE IF EXISTS dbo.Orders;
DROP TABLE IF EXISTS dbo.ProductOptions;
DROP TABLE IF EXISTS dbo.ProductOptionGroups;
DROP TABLE IF EXISTS dbo.ProductTags;
DROP TABLE IF EXISTS dbo.Products;
DROP TABLE IF EXISTS dbo.Inventory;
DROP TABLE IF EXISTS dbo.Tables;
DROP TABLE IF EXISTS dbo.Reservations;
DROP TABLE IF EXISTS dbo.Customers;
DROP TABLE IF EXISTS dbo.DeliveryRanges;
DROP TABLE IF EXISTS dbo.Printers;
DROP TABLE IF EXISTS dbo.Settings;
DROP TABLE IF EXISTS dbo.Branches;
DROP TABLE IF EXISTS dbo.Users;
DROP TABLE IF EXISTS dbo.WhatsAppConfig;
*/

/* -------------------------------------------------------------------------- */
/* Usuarios del sistema (admin, cajero, cocina, mozo)                         */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
    Name          NVARCHAR(120)    NOT NULL,
    Email         NVARCHAR(180)    NOT NULL,
    PasswordHash  NVARCHAR(255)    NOT NULL,
    Role          NVARCHAR(20)     NOT NULL, -- admin | cajero | cocina | mozo
    Active        BIT              NOT NULL CONSTRAINT DF_Users_Active DEFAULT (1),
    Pin           NVARCHAR(10)     NOT NULL CONSTRAINT DF_Users_Pin DEFAULT (N'0000'),
    CreatedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT CK_Users_Role CHECK (Role IN (N'admin', N'cajero', N'cocina', N'mozo'))
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Sucursales                                                                 */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Branches', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Branches (
    Id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Branches PRIMARY KEY DEFAULT NEWID(),
    Name      NVARCHAR(120)    NOT NULL,
    Address   NVARCHAR(255)    NOT NULL,
    Phone     NVARCHAR(40)     NOT NULL,
    Lat       DECIMAL(10,7)    NULL,      -- origen delivery
    Lng       DECIMAL(10,7)    NULL,
    Active    BIT              NOT NULL CONSTRAINT DF_Branches_Active DEFAULT (1),
    CreatedAt DATETIME2(0)     NOT NULL CONSTRAINT DF_Branches_CreatedAt DEFAULT (SYSUTCDATETIME())
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Configuración general                                                      */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Settings (
    Id              INT              NOT NULL CONSTRAINT PK_Settings PRIMARY KEY DEFAULT (1),
    Name            NVARCHAR(120)    NOT NULL,
    Slogan          NVARCHAR(255)    NOT NULL,
    Address         NVARCHAR(255)    NOT NULL,
    Phone           NVARCHAR(40)     NOT NULL,
    Ruc             NVARCHAR(20)     NOT NULL,
    IgvRate         DECIMAL(5,4)     NOT NULL CONSTRAINT DF_Settings_IgvRate DEFAULT (0.18),
    Hours           NVARCHAR(120)    NOT NULL,
    OriginLat       DECIMAL(10,7)    NULL,  -- local para API de ruta
    OriginLng       DECIMAL(10,7)    NULL,
    GeoRouteApiUrl  NVARCHAR(500)    NULL,  -- plantilla o base URL
    GeoRouteToken   NVARCHAR(100)    NULL,  -- ej. demo
    WhatsAppNumber  NVARCHAR(40)     NULL,
    NextOrderNumber INT              NOT NULL CONSTRAINT DF_Settings_NextOrder DEFAULT (1001),
    UpdatedAt       DATETIME2(0)     NOT NULL CONSTRAINT DF_Settings_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_Settings_SingleRow CHECK (Id = 1)
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Rangos de delivery (administrables)                                        */
/* distanceKmFrom inclusive, distanceKmTo exclusive (último puede ser NULL)  */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.DeliveryRanges', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DeliveryRanges (
    Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DeliveryRanges PRIMARY KEY DEFAULT NEWID(),
    Name            NVARCHAR(80)     NOT NULL,
    DistanceKmFrom  DECIMAL(8,2)     NOT NULL, -- ej. 0
    DistanceKmTo    DECIMAL(8,2)     NULL,     -- NULL = sin límite superior
    Fee             DECIMAL(10,2)    NOT NULL,
    SortOrder       INT              NOT NULL CONSTRAINT DF_DeliveryRanges_Sort DEFAULT (0),
    Active          BIT              NOT NULL CONSTRAINT DF_DeliveryRanges_Active DEFAULT (1),
    CreatedAt       DATETIME2(0)     NOT NULL CONSTRAINT DF_DeliveryRanges_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_DeliveryRanges_From CHECK (DistanceKmFrom >= 0),
    CONSTRAINT CK_DeliveryRanges_Fee CHECK (Fee >= 0)
  );
  CREATE INDEX IX_DeliveryRanges_Active_Sort ON dbo.DeliveryRanges (Active, SortOrder);
END
GO

/* -------------------------------------------------------------------------- */
/* Productos + opciones                                                       */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Products (
    Id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Products PRIMARY KEY DEFAULT NEWID(),
    Name           NVARCHAR(160)    NOT NULL,
    Description    NVARCHAR(500)    NOT NULL CONSTRAINT DF_Products_Description DEFAULT (N''),
    Category       NVARCHAR(80)     NOT NULL,
    Price          DECIMAL(10,2)    NOT NULL,
    OriginalPrice  DECIMAL(10,2)    NULL,
    Emoji          NVARCHAR(16)     NOT NULL CONSTRAINT DF_Products_Emoji DEFAULT (N'🍗'),
    Tone           NVARCHAR(20)     NOT NULL CONSTRAINT DF_Products_Tone DEFAULT (N'#E85D04'),
    Available      BIT              NOT NULL CONSTRAINT DF_Products_Available DEFAULT (1),
    PrepMinutes    INT              NOT NULL CONSTRAINT DF_Products_Prep DEFAULT (15),
    CreatedAt      DATETIME2(0)     NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt      DATETIME2(0)     NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
  CREATE INDEX IX_Products_Category ON dbo.Products (Category, Available);
END
GO

IF OBJECT_ID(N'dbo.ProductTags', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductTags (
    ProductId UNIQUEIDENTIFIER NOT NULL,
    Tag       NVARCHAR(40)     NOT NULL,
    CONSTRAINT PK_ProductTags PRIMARY KEY (ProductId, Tag),
    CONSTRAINT FK_ProductTags_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id) ON DELETE CASCADE
  );
END
GO

IF OBJECT_ID(N'dbo.ProductOptionGroups', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductOptionGroups (
    Id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductOptionGroups PRIMARY KEY DEFAULT NEWID(),
    ProductId UNIQUEIDENTIFIER NOT NULL,
    Title     NVARCHAR(120)    NOT NULL,
    Required  BIT              NOT NULL CONSTRAINT DF_POG_Required DEFAULT (0),
    MaxSelect INT              NOT NULL CONSTRAINT DF_POG_MaxSelect DEFAULT (1),
    SortOrder INT              NOT NULL CONSTRAINT DF_POG_Sort DEFAULT (0),
    CONSTRAINT FK_POG_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id) ON DELETE CASCADE
  );
END
GO

IF OBJECT_ID(N'dbo.ProductOptions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductOptions (
    Id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ProductOptions PRIMARY KEY DEFAULT NEWID(),
    GroupId   UNIQUEIDENTIFIER NOT NULL,
    Name      NVARCHAR(120)    NOT NULL,
    Price     DECIMAL(10,2)    NOT NULL CONSTRAINT DF_PO_Price DEFAULT (0),
    SortOrder INT              NOT NULL CONSTRAINT DF_PO_Sort DEFAULT (0),
    CONSTRAINT FK_PO_Group FOREIGN KEY (GroupId) REFERENCES dbo.ProductOptionGroups(Id) ON DELETE CASCADE
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Inventario                                                                 */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Inventory', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Inventory (
    Id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Inventory PRIMARY KEY DEFAULT NEWID(),
    Name      NVARCHAR(120)    NOT NULL,
    Unit      NVARCHAR(20)     NOT NULL,
    Stock     DECIMAL(12,3)    NOT NULL CONSTRAINT DF_Inventory_Stock DEFAULT (0),
    MinStock  DECIMAL(12,3)    NOT NULL CONSTRAINT DF_Inventory_Min DEFAULT (0),
    Cost      DECIMAL(10,2)    NOT NULL CONSTRAINT DF_Inventory_Cost DEFAULT (0),
    UpdatedAt DATETIME2(0)     NOT NULL CONSTRAINT DF_Inventory_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Mesas                                                                      */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Tables', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Tables (
    Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Tables PRIMARY KEY DEFAULT NEWID(),
    Number     INT              NOT NULL,
    Seats      INT              NOT NULL,
    Zone       NVARCHAR(60)     NOT NULL,
    Status     NVARCHAR(20)     NOT NULL CONSTRAINT DF_Tables_Status DEFAULT (N'libre'), -- libre | ocupada | cuenta
    CurrentOrderId UNIQUEIDENTIFIER NULL,
    CONSTRAINT UQ_Tables_Number UNIQUE (Number),
    CONSTRAINT CK_Tables_Status CHECK (Status IN (N'libre', N'ocupada', N'cuenta'))
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Clientes web                                                               */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customers (
    Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Customers PRIMARY KEY DEFAULT NEWID(),
    Name         NVARCHAR(120)    NOT NULL,
    Phone        NVARCHAR(40)     NOT NULL,
    Email        NVARCHAR(180)    NULL,
    PasswordHash NVARCHAR(255)    NOT NULL,
    Address      NVARCHAR(255)    NULL,
    Lat          DECIMAL(10,7)    NULL,
    Lng          DECIMAL(10,7)    NULL,
    CreatedAt    DATETIME2(0)     NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Customers_Phone UNIQUE (Phone)
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Pedidos                                                                    */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Orders (
    Id                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Orders PRIMARY KEY DEFAULT NEWID(),
    Number                INT              NOT NULL,
    Type                  NVARCHAR(20)     NOT NULL, -- salon | llevar | delivery | web
    Status                NVARCHAR(20)     NOT NULL CONSTRAINT DF_Orders_Status DEFAULT (N'nuevo'),
    TableId               UNIQUEIDENTIFIER NULL,
    TableNumber           INT              NULL,
    CustomerId            UNIQUEIDENTIFIER NULL,
    CustomerName          NVARCHAR(120)    NOT NULL,
    CustomerPhone         NVARCHAR(40)     NULL,
    Address               NVARCHAR(255)    NULL,
    AddressLat            DECIMAL(10,7)    NULL,
    AddressLng            DECIMAL(10,7)    NULL,
    DeliveryDistanceKm    DECIMAL(8,2)     NULL,
    DeliveryTimeMin       INT              NULL,
    DeliveryFee           DECIMAL(10,2)    NOT NULL CONSTRAINT DF_Orders_DeliveryFee DEFAULT (0),
    -- Pago contra entrega (pedido web/cliente)
    CodPaymentMethod      NVARCHAR(20)     NULL, -- yape | plin | efectivo
    CodCashAmount         DECIMAL(10,2)    NULL, -- con cuánto paga (efectivo)
    Discount              DECIMAL(10,2)    NOT NULL CONSTRAINT DF_Orders_Discount DEFAULT (0),
    Subtotal              DECIMAL(10,2)    NOT NULL,
    Igv                   DECIMAL(10,2)    NOT NULL,
    Total                 DECIMAL(10,2)    NOT NULL,
    Paid                  BIT              NOT NULL CONSTRAINT DF_Orders_Paid DEFAULT (0),
    Notes                 NVARCHAR(500)    NULL,
    Source                NVARCHAR(20)     NOT NULL, -- pos | web
    CreatedByUserId       UNIQUEIDENTIFIER NULL,
    DriverLat             DECIMAL(10,7)    NULL,
    DriverLng             DECIMAL(10,7)    NULL,
    WhatsAppNotifiedAt    DATETIME2(0)     NULL,
    CreatedAt             DATETIME2(0)     NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt             DATETIME2(0)     NOT NULL CONSTRAINT DF_Orders_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Orders_Number UNIQUE (Number),
    CONSTRAINT CK_Orders_Type CHECK (Type IN (N'salon', N'llevar', N'delivery', N'web')),
    CONSTRAINT CK_Orders_Status CHECK (Status IN (N'nuevo', N'en_cocina', N'listo', N'entregado', N'cancelado')),
    CONSTRAINT CK_Orders_Source CHECK (Source IN (N'pos', N'web')),
    CONSTRAINT CK_Orders_CodMethod CHECK (CodPaymentMethod IS NULL OR CodPaymentMethod IN (N'yape', N'plin', N'efectivo')),
    CONSTRAINT FK_Orders_Table FOREIGN KEY (TableId) REFERENCES dbo.Tables(Id),
    CONSTRAINT FK_Orders_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id),
    CONSTRAINT FK_Orders_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id)
  );
  CREATE INDEX IX_Orders_Status_Created ON dbo.Orders (Status, CreatedAt DESC);
  CREATE INDEX IX_Orders_Type_Paid ON dbo.Orders (Type, Paid);
  CREATE INDEX IX_Orders_Source ON dbo.Orders (Source, CreatedAt DESC);
END
GO

IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OrderItems (
    Id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_OrderItems PRIMARY KEY DEFAULT NEWID(),
    OrderId   UNIQUEIDENTIFIER NOT NULL,
    ProductId UNIQUEIDENTIFIER NULL,
    Name      NVARCHAR(160)    NOT NULL,
    Qty       INT              NOT NULL,
    Price     DECIMAL(10,2)    NOT NULL, -- precio unitario (base + opciones)
    Notes     NVARCHAR(255)    NULL,
    SortOrder INT              NOT NULL CONSTRAINT DF_OrderItems_Sort DEFAULT (0),
    CONSTRAINT FK_OrderItems_Order FOREIGN KEY (OrderId) REFERENCES dbo.Orders(Id) ON DELETE CASCADE,
    CONSTRAINT FK_OrderItems_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(Id),
    CONSTRAINT CK_OrderItems_Qty CHECK (Qty > 0)
  );
  CREATE INDEX IX_OrderItems_OrderId ON dbo.OrderItems (OrderId);
END
GO

IF OBJECT_ID(N'dbo.OrderItemOptions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OrderItemOptions (
    Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_OrderItemOptions PRIMARY KEY DEFAULT NEWID(),
    OrderItemId  UNIQUEIDENTIFIER NOT NULL,
    GroupId      UNIQUEIDENTIFIER NULL,
    OptionId     UNIQUEIDENTIFIER NULL,
    Name         NVARCHAR(120)    NOT NULL,
    Price        DECIMAL(10,2)    NOT NULL CONSTRAINT DF_OIO_Price DEFAULT (0),
    CONSTRAINT FK_OIO_Item FOREIGN KEY (OrderItemId) REFERENCES dbo.OrderItems(Id) ON DELETE CASCADE
  );
END
GO

/* -------------------------------------------------------------------------- */
/* Pagos (soporta pago múltiple por pedido/mesa)                              */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.OrderPayments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OrderPayments (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_OrderPayments PRIMARY KEY DEFAULT NEWID(),
    OrderId       UNIQUEIDENTIFIER NOT NULL,
    Method        NVARCHAR(20)     NOT NULL, -- efectivo | yape | plin | tarjeta
    Amount        DECIMAL(10,2)    NOT NULL,
    CashTendered  DECIMAL(10,2)    NULL,     -- con cuánto paga (efectivo)
    CashChange    DECIMAL(10,2)    NULL,     -- vuelto
    Reference     NVARCHAR(80)     NULL,     -- nro operación yape/plin/tarjeta
    CreatedByUserId UNIQUEIDENTIFIER NULL,
    CreatedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_OrderPayments_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_OrderPayments_Order FOREIGN KEY (OrderId) REFERENCES dbo.Orders(Id) ON DELETE CASCADE,
    CONSTRAINT FK_OrderPayments_User FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_OrderPayments_Method CHECK (Method IN (N'efectivo', N'yape', N'plin', N'tarjeta')),
    CONSTRAINT CK_OrderPayments_Amount CHECK (Amount > 0)
  );
  CREATE INDEX IX_OrderPayments_OrderId ON dbo.OrderPayments (OrderId);
END
GO

/* -------------------------------------------------------------------------- */
/* Reservas                                                                   */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Reservations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Reservations (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Reservations PRIMARY KEY DEFAULT NEWID(),
    CustomerId    UNIQUEIDENTIFIER NULL,
    CustomerName  NVARCHAR(120)    NOT NULL,
    CustomerPhone NVARCHAR(40)     NOT NULL,
    [Date]        DATE             NOT NULL,
    [Time]        TIME(0)          NOT NULL,
    Guests        INT              NOT NULL,
    Notes         NVARCHAR(255)    NULL,
    Status        NVARCHAR(20)     NOT NULL CONSTRAINT DF_Reservations_Status DEFAULT (N'pendiente'),
    CreatedAt     DATETIME2(0)     NOT NULL CONSTRAINT DF_Reservations_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_Reservations_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id),
    CONSTRAINT CK_Reservations_Status CHECK (Status IN (N'pendiente', N'confirmada', N'cancelada', N'completada')),
    CONSTRAINT CK_Reservations_Guests CHECK (Guests > 0)
  );
  CREATE INDEX IX_Reservations_Date ON dbo.Reservations ([Date], Status);
END
GO

/* -------------------------------------------------------------------------- */
/* Impresoras                                                                 */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Printers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Printers (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Printers PRIMARY KEY DEFAULT NEWID(),
    RoleKey       NVARCHAR(20)     NOT NULL, -- caja | cocina
    Label         NVARCHAR(80)     NOT NULL,
    Driver        NVARCHAR(20)     NOT NULL CONSTRAINT DF_Printers_Driver DEFAULT (N'browser'), -- browser | usb | network
    Enabled       BIT              NOT NULL CONSTRAINT DF_Printers_Enabled DEFAULT (1),
    UsbVendorId   INT              NULL,
    UsbProductId  INT              NULL,
    UsbDeviceName NVARCHAR(120)    NULL,
    NetworkUrl    NVARCHAR(255)    NULL,
    Cols          INT              NOT NULL CONSTRAINT DF_Printers_Cols DEFAULT (48),
    OpenDrawer    BIT              NOT NULL CONSTRAINT DF_Printers_Drawer DEFAULT (0),
    BeepOnPrint   BIT              NOT NULL CONSTRAINT DF_Printers_Beep DEFAULT (0),
    AutoCut       BIT              NOT NULL CONSTRAINT DF_Printers_Cut DEFAULT (1),
    CONSTRAINT UQ_Printers_RoleKey UNIQUE (RoleKey),
    CONSTRAINT CK_Printers_Driver CHECK (Driver IN (N'browser', N'usb', N'network')),
    CONSTRAINT CK_Printers_Role CHECK (RoleKey IN (N'caja', N'cocina'))
  );
END
GO

/* -------------------------------------------------------------------------- */
/* WhatsApp config                                                            */
/* -------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.WhatsAppConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WhatsAppConfig (
    Id           INT           NOT NULL CONSTRAINT PK_WhatsAppConfig PRIMARY KEY DEFAULT (1),
    Provider     NVARCHAR(20)  NOT NULL CONSTRAINT DF_WA_Provider DEFAULT (N'directo'), -- directo | api
    PhoneNumber  NVARCHAR(40)  NOT NULL,
    ApiUrl       NVARCHAR(255) NULL,
    ApiToken     NVARCHAR(255) NULL,
    Enabled      BIT           NOT NULL CONSTRAINT DF_WA_Enabled DEFAULT (1),
    NotifyOnNewOrder BIT       NOT NULL CONSTRAINT DF_WA_NotifyNew DEFAULT (1),
    TemplatePedidoRecibido NVARCHAR(1000) NULL,
    TemplatePedidoListo    NVARCHAR(1000) NULL,
    TemplatePedidoEnCamino NVARCHAR(1000) NULL,
    UpdatedAt    DATETIME2(0)  NOT NULL CONSTRAINT DF_WA_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_WA_SingleRow CHECK (Id = 1),
    CONSTRAINT CK_WA_Provider CHECK (Provider IN (N'directo', N'api'))
  );
END
GO

PRINT N'OK: tablas creadas en Polleria';
GO
