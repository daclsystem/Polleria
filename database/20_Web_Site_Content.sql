-- Corrige banners de prueba ("API OK") y deja contenido web base editable.
-- Ejecutar en SQL Server (BD Polleria).

IF OBJECT_ID(N'dbo.AppConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppConfig (
    ConfigKey   NVARCHAR(80)  NOT NULL CONSTRAINT PK_AppConfig PRIMARY KEY,
    ConfigValue NVARCHAR(MAX) NOT NULL,
    UpdatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_AppConfig_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
END
GO

MERGE dbo.AppConfig AS t
USING (SELECT N'web_banners' AS ConfigKey) AS s
ON t.ConfigKey = s.ConfigKey
WHEN MATCHED THEN UPDATE SET
  ConfigValue = N'[{"id":"b1","title":"El mejor pollo de Cañete","subtitle":"Crujiente por fuera, jugoso por dentro. El sabor que todos aman.","cta":"Ver carta","bgGradient":"from-[#0b2a0b] via-[#1a3d1a] to-[#0f4d2e]","active":true},{"id":"b2","title":"Chifa & pollería en uno","subtitle":"Chaufa, tallarín y pollo a la brasa. Todo en un solo lugar.","cta":"Pedir ahora","bgGradient":"from-[#3d1a0b] via-[#5c2e0a] to-[#1a3d1a]","active":true},{"id":"b3","title":"Delivery a tu puerta","subtitle":"Pide por la web y sigue tu pedido en tiempo real.","cta":"Ordenar","bgGradient":"from-[#062016] via-[#0f3d2e] to-[#1a3d1a]","active":true}]',
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue)
VALUES (
  N'web_banners',
  N'[{"id":"b1","title":"El mejor pollo de Cañete","subtitle":"Crujiente por fuera, jugoso por dentro. El sabor que todos aman.","cta":"Ver carta","bgGradient":"from-[#0b2a0b] via-[#1a3d1a] to-[#0f4d2e]","active":true},{"id":"b2","title":"Chifa & pollería en uno","subtitle":"Chaufa, tallarín y pollo a la brasa. Todo en un solo lugar.","cta":"Pedir ahora","bgGradient":"from-[#3d1a0b] via-[#5c2e0a] to-[#1a3d1a]","active":true},{"id":"b3","title":"Delivery a tu puerta","subtitle":"Pide por la web y sigue tu pedido en tiempo real.","cta":"Ordenar","bgGradient":"from-[#062016] via-[#0f3d2e] to-[#1a3d1a]","active":true}]'
);
GO

MERGE dbo.AppConfig AS t
USING (SELECT N'web_site' AS ConfigKey) AS s
ON t.ConfigKey = s.ConfigKey
WHEN MATCHED THEN UPDATE SET
  ConfigValue = N'{"brandName":"Chifa-Pollería Lopez","slogan":"El mejor pollo a la brasa de Cañete","heroEyebrow":"⭐ Cañete · Chifa & Pollería","aboutTitle":"Sazón de casa, desde Cañete","aboutText":"Somos una familia cañetana que une lo mejor del chifa y el pollo a la brasa. Recetas con sazón de casa, ingredientes frescos y atención cercana.","menuTitle":"Nuestra carta","menuSubtitle":"Pollo a la brasa, chifa y especiales listos para ti","localesTitle":"Nuestros locales","localesSubtitle":"Salón, para llevar o delivery — te esperamos","scheduleTitle":"Horarios de atención","scheduleSubtitle":"Abierto todos los días para almuerzo y cena","contactTitle":"Habla con nosotros","contactSubtitle":"WhatsApp, llamada o redes. Respondemos rápido.","whatsappNumber":"51962797752","phoneDisplay":"962 797 752","facebookUrl":"https://www.facebook.com/p/Chifa-polleria-Lopez-61586064026668/","instagramUrl":"","tiktokUrl":"https://www.tiktok.com/@edgarlopezvega07","highlights":[{"id":"h1","title":"Pollo a la brasa","text":"Crujiente por fuera, jugoso por dentro.","icon":"flame"},{"id":"h2","title":"Chifa casero","text":"Chaufa, tallarín y especiales.","icon":"utensils"},{"id":"h3","title":"Delivery rápido","text":"Seguimiento en vivo.","icon":"truck"},{"id":"h4","title":"Horario amplio","text":"Almuerzo y cena todos los días.","icon":"clock"}],"branches":[{"id":"br1","name":"Local Principal","address":"Chocos Imperial, Cañete","phone":"962 797 752","hours":"11:00 – 23:00","mapUrl":"https://maps.google.com/?q=Chocos+Imperial+Cañete","active":true}],"schedule":[{"id":"s1","label":"Lunes – Domingo","hours":"11:00 – 23:00"},{"id":"s2","label":"Delivery","hours":"11:00 – 22:30"},{"id":"s3","label":"Feriados","hours":"Consultar por WhatsApp","linkWhatsApp":true}],"sections":{"highlights":true,"about":true,"menu":true,"schedule":true,"locales":true,"contact":true}}',
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue)
VALUES (
  N'web_site',
  N'{"brandName":"Chifa-Pollería Lopez","slogan":"El mejor pollo a la brasa de Cañete","heroEyebrow":"⭐ Cañete · Chifa & Pollería","aboutTitle":"Sazón de casa, desde Cañete","aboutText":"Somos una familia cañetana que une lo mejor del chifa y el pollo a la brasa.","menuTitle":"Nuestra carta","menuSubtitle":"Pollo a la brasa, chifa y especiales","localesTitle":"Nuestros locales","localesSubtitle":"Salón, para llevar o delivery","scheduleTitle":"Horarios de atención","scheduleSubtitle":"Abierto todos los días","contactTitle":"Habla con nosotros","contactSubtitle":"WhatsApp o llamada","whatsappNumber":"51962797752","phoneDisplay":"962 797 752","facebookUrl":"https://www.facebook.com/p/Chifa-polleria-Lopez-61586064026668/","instagramUrl":"","tiktokUrl":"https://www.tiktok.com/@edgarlopezvega07","highlights":[{"id":"h1","title":"Pollo a la brasa","text":"Crujiente y jugoso.","icon":"flame"},{"id":"h2","title":"Chifa casero","text":"Sazón de siempre.","icon":"utensils"},{"id":"h3","title":"Delivery rápido","text":"Seguimiento en vivo.","icon":"truck"},{"id":"h4","title":"Horario amplio","text":"Todos los días.","icon":"clock"}],"branches":[{"id":"br1","name":"Local Principal","address":"Chocos Imperial, Cañete","phone":"962 797 752","hours":"11:00 – 23:00","mapUrl":"https://maps.google.com/?q=Chocos+Imperial+Cañete","active":true}],"schedule":[{"id":"s1","label":"Lunes – Domingo","hours":"11:00 – 23:00"},{"id":"s2","label":"Delivery","hours":"11:00 – 22:30"},{"id":"s3","label":"Feriados","hours":"Consultar por WhatsApp","linkWhatsApp":true}],"sections":{"highlights":true,"about":true,"menu":true,"schedule":true,"locales":true,"contact":true}}'
);
GO

PRINT N'OK: web_banners + web_site actualizados';
GO
