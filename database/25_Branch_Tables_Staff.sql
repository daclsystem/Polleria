/* Lugares (zonas) y mesas por sede + local de trabajo del personal */

IF COL_LENGTH('dbo.Users', 'BranchId') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD BranchId UNIQUEIDENTIFIER NULL;
END
GO

IF COL_LENGTH('dbo.Tables', 'BranchId') IS NULL
BEGIN
  ALTER TABLE dbo.Tables ADD BranchId UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Users_Branch'
)
BEGIN
  ALTER TABLE dbo.Users WITH NOCHECK
    ADD CONSTRAINT FK_Users_Branch FOREIGN KEY (BranchId) REFERENCES dbo.Branches (Id);
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Tables_Branch'
)
BEGIN
  ALTER TABLE dbo.Tables WITH NOCHECK
    ADD CONSTRAINT FK_Tables_Branch FOREIGN KEY (BranchId) REFERENCES dbo.Branches (Id);
END
GO

DECLARE @bid UNIQUEIDENTIFIER =
  (SELECT TOP 1 Id FROM dbo.Branches WHERE Active = 1 ORDER BY Name);

IF @bid IS NOT NULL
BEGIN
  UPDATE dbo.Tables SET BranchId = @bid WHERE BranchId IS NULL;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE name = N'UQ_Tables_Number' AND parent_object_id = OBJECT_ID(N'dbo.Tables')
)
BEGIN
  ALTER TABLE dbo.Tables DROP CONSTRAINT UQ_Tables_Number;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UQ_Tables_Branch_Number' AND object_id = OBJECT_ID(N'dbo.Tables')
)
BEGIN
  CREATE UNIQUE INDEX UQ_Tables_Branch_Number
    ON dbo.Tables (BranchId, Number)
    WHERE BranchId IS NOT NULL;
END
GO
