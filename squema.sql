-- 1. Crear Tabla de Usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    pin VARCHAR(4) NOT NULL UNIQUE,
    total_impresiones INT DEFAULT 0,
    total_escaneos INT DEFAULT 0
);

-- 2. Crear Tabla de Historial
CREATE TABLE historial_acciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_accion VARCHAR(20) NOT NULL, -- 'IMPRESION' o 'ESCANEO'
    detalles TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tu "Seed" de Alta Sociedad (Dar de alta a la familia tú mismo)
INSERT INTO usuarios (nombre, pin) VALUES 
('citlali', '2309'),
('daniel', '0805'),
('jonatan', '1502'),
('arely', '1905'),
('visita', '0000'),
('isaac', '0510'); -- Tú, por supuesto
