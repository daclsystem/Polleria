USE Polleria;
GO

IF COL_LENGTH('dbo.Users', 'PhotoUrl') IS NULL
  ALTER TABLE dbo.Users ADD PhotoUrl NVARCHAR(500) NULL;
GO

-- Avatares por defecto según nombre (ui-avatars)
UPDATE dbo.Users
SET PhotoUrl = N'https://ui-avatars.com/api/?name=' + REPLACE(Name, N' ', N'+')
  + N'&background=e11d2e&color=ffffff&size=128&bold=true'
WHERE PhotoUrl IS NULL OR PhotoUrl = N'';
GO

PRINT N'OK: Users.PhotoUrl';
GO
