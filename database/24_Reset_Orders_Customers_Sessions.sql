/* Limpia pedidos y clientes para pruebas. Cierra todas las sesiones.
   Agrega Placa en conductores. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
USE Polleria;

IF COL_LENGTH('dbo.Drivers', 'Plate') IS NULL
  ALTER TABLE dbo.Drivers ADD Plate NVARCHAR(20) NULL;

IF OBJECT_ID(N'dbo.Tables', N'U') IS NOT NULL
  UPDATE dbo.Tables SET Status = N'libre', CurrentOrderId = NULL;

IF OBJECT_ID(N'dbo.InventoryMovements', N'U') IS NOT NULL DELETE FROM dbo.InventoryMovements;
IF OBJECT_ID(N'dbo.CouponRedemptions', N'U') IS NOT NULL DELETE FROM dbo.CouponRedemptions;
IF OBJECT_ID(N'dbo.OrderPayments', N'U') IS NOT NULL DELETE FROM dbo.OrderPayments;
IF OBJECT_ID(N'dbo.OrderItemOptions', N'U') IS NOT NULL DELETE FROM dbo.OrderItemOptions;
IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NOT NULL DELETE FROM dbo.OrderItems;
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL DELETE FROM dbo.Orders;
IF OBJECT_ID(N'dbo.Reservations', N'U') IS NOT NULL DELETE FROM dbo.Reservations;

IF COL_LENGTH('dbo.Settings', 'NextOrderNumber') IS NOT NULL
  UPDATE dbo.Settings SET NextOrderNumber = 1001 WHERE Id = 1;

IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NOT NULL DELETE FROM dbo.ProductReviews;
IF OBJECT_ID(N'dbo.CustomerAddresses', N'U') IS NOT NULL DELETE FROM dbo.CustomerAddresses;
IF OBJECT_ID(N'dbo.AuthOtpCodes', N'U') IS NOT NULL
  DELETE FROM dbo.AuthOtpCodes WHERE AccountType IN (N'customer', N'cliente');
IF OBJECT_ID(N'dbo.Customers', N'U') IS NOT NULL DELETE FROM dbo.Customers;

IF COL_LENGTH('dbo.Users', 'ActiveSessionId') IS NOT NULL
  UPDATE dbo.Users SET ActiveSessionId = NULL;
IF COL_LENGTH('dbo.Customers', 'ActiveSessionId') IS NOT NULL
  UPDATE dbo.Customers SET ActiveSessionId = NULL;
IF COL_LENGTH('dbo.Drivers', 'ActiveSessionId') IS NOT NULL
  UPDATE dbo.Drivers SET ActiveSessionId = NULL;

PRINT N'OK: pedidos y clientes limpios; sesiones cerradas; Drivers.Plate listo';
