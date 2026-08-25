USE Polleria;
GO

-- Segundo mozo para pruebas en paralelo (celular distinto del Mozo 1)
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'mozo2@lopez.pe')
BEGIN
  INSERT INTO dbo.Users (Id, Name, Email, PasswordHash, Role, Active, Pin, Phone, PhotoUrl)
  VALUES (
    NEWID(),
    N'Mozo 2',
    N'mozo2@lopez.pe',
    N'$2b$10$l5KA3zRSN7bWRHPFy/Rb5uRZEfg1tnRVTzSz0DdWh7LE4j.Doqosa',
    N'mozo',
    1,
    N'4444',
    N'51944444444',
    N'https://ui-avatars.com/api/?name=Mozo+2&background=e11d2e&color=ffffff&size=128&bold=true'
  );
  PRINT N'OK: INSERT Mozo 2';
END
ELSE
BEGIN
  UPDATE dbo.Users
  SET Name = N'Mozo 2',
      Role = N'mozo',
      Active = 1,
      Pin = N'4444',
      Phone = N'51944444444',
      PasswordHash = N'$2b$10$l5KA3zRSN7bWRHPFy/Rb5uRZEfg1tnRVTzSz0DdWh7LE4j.Doqosa',
      PhotoUrl = ISNULL(PhotoUrl, N'https://ui-avatars.com/api/?name=Mozo+2&background=e11d2e&color=ffffff&size=128&bold=true'),
      UpdatedAt = SYSUTCDATETIME()
  WHERE Email = N'mozo2@lopez.pe';
  PRINT N'OK: UPDATE Mozo 2';
END
GO
