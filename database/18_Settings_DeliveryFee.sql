/*
================================================================================
  Agrega DeliveryFee a Settings (fallback de envío si no hay cotización por km)
  Ejecutar en BD ya existente. Seguro si la columna ya está.
================================================================================
*/
USE Polleria;
GO

IF COL_LENGTH('dbo.Settings', 'DeliveryFee') IS NULL
BEGIN
  ALTER TABLE dbo.Settings
    ADD DeliveryFee DECIMAL(10,2) NOT NULL
      CONSTRAINT DF_Settings_DeliveryFee DEFAULT (5);
END
GO
