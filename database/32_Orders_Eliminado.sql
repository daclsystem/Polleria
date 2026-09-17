/*
  Pedidos: estado 'eliminado' (baja lógica, no se borra el registro).
  Solo el administrador marca este estado desde Pedidos.
*/
USE Polleria;
GO

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_Orders_Status'
    AND parent_object_id = OBJECT_ID(N'dbo.Orders')
)
BEGIN
  ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_Status;
END
GO

ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Status
  CHECK (Status IN (N'nuevo', N'en_cocina', N'listo', N'entregado', N'cancelado', N'eliminado'));
GO
