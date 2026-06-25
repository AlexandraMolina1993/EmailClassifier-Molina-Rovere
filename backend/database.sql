-- ============================================================
-- Script de creación de base de datos y tabla
-- Sistema Inteligente de Clasificación de Correos Electrónicos
-- Motor: SQL Server 2016+
-- ============================================================

-- 1. Crear la base de datos (ejecutar como sysadmin)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'EmailClassifier')
BEGIN
    CREATE DATABASE EmailClassifier
        COLLATE Modern_Spanish_CI_AI;
    PRINT '✅ Base de datos EmailClassifier creada.';
END
ELSE
    PRINT 'ℹ️  La base de datos EmailClassifier ya existe.';
GO

USE EmailClassifier;
GO

-- 2. Crear la tabla Correos
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name = 'Correos' AND xtype = 'U'
)
BEGIN
    CREATE TABLE dbo.Correos (
        id                  INT             IDENTITY(1,1)   NOT NULL,
        asunto              NVARCHAR(500)                   NOT NULL,
        contenido           NVARCHAR(MAX)                   NOT NULL,
        categoria           NVARCHAR(100)                   NOT NULL,
        area_responsable    NVARCHAR(100)                   NOT NULL,
        prioridad           NVARCHAR(10)                    NOT NULL,
        fecha_clasificacion DATETIME2(0)                    NOT NULL
            CONSTRAINT DF_Correos_fecha DEFAULT (GETDATE()),

        CONSTRAINT PK_Correos
            PRIMARY KEY CLUSTERED (id ASC),

        CONSTRAINT CK_Correos_prioridad
            CHECK (prioridad IN ('Baja', 'Media', 'Alta')),

        CONSTRAINT CK_Correos_categoria
            CHECK (categoria IN (
                'Consulta General', 'Reclamo', 'Soporte Técnico',
                'Ventas', 'Facturación', 'Recursos Humanos', 'Otros'
            ))
    );

    -- Índices para consultas frecuentes
    CREATE NONCLUSTERED INDEX IX_Correos_fecha
        ON dbo.Correos (fecha_clasificacion DESC);

    CREATE NONCLUSTERED INDEX IX_Correos_categoria
        ON dbo.Correos (categoria);

    PRINT '✅ Tabla Correos creada con índices.';
END
ELSE
    PRINT 'ℹ️  La tabla Correos ya existe.';
GO

-- 3. Vista de resumen (opcional, útil para reportes)
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'VW_ResumenClasificaciones')
BEGIN
    EXEC sp_executesql N'
    CREATE VIEW dbo.VW_ResumenClasificaciones AS
    SELECT
        categoria,
        area_responsable,
        prioridad,
        COUNT(*) AS total,
        MAX(fecha_clasificacion) AS ultima_clasificacion
    FROM dbo.Correos
    GROUP BY categoria, area_responsable, prioridad;
    ';
    PRINT '✅ Vista VW_ResumenClasificaciones creada.';
END
GO

-- 4. Datos de ejemplo para pruebas iniciales
INSERT INTO dbo.Correos (asunto, contenido, categoria, area_responsable, prioridad)
VALUES
    (
        'Mi factura del mes tiene un error',
        'Estimados, la factura N° 00234 tiene un monto incorrecto. Me cobraron $5000 extra.',
        'Facturación', 'Administración', 'Alta'
    ),
    (
        'Consulta sobre planes de servicio',
        'Hola, quisiera saber qué planes de servicio tienen disponibles para empresas.',
        'Consulta General', 'Atención al Cliente', 'Baja'
    ),
    (
        'Sistema caído urgente',
        'El sistema de gestión lleva 2 horas sin funcionar. Necesitamos solución urgente.',
        'Soporte Técnico', 'Mesa de Ayuda', 'Alta'
    );

PRINT '✅ Datos de ejemplo insertados.';
PRINT '✅ Script completado exitosamente.';
GO
