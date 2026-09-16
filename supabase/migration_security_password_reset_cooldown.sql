-- Fix MEDIO (auditoría de seguridad): /api/auth/forgot-password no tenía
-- ningún control de tasa — cada llamada reescribe de verdad la contraseña
-- real del usuario con una nueva temporal. Sin límite, cualquiera que
-- conozca/adivine un correo de la empresa (nombre.apellido@altosdelpuerto.cl)
-- puede forzar el reseteo repetido de una cuenta ajena: no roba la cuenta
-- (la clave nueva solo llega al correo real), pero la deja inservible cada
-- vez hasta que su dueño revise el correo — DoS de disponibilidad dirigido.
--
-- Guarda cuándo fue el último reseteo real para aplicar un cooldown desde
-- la ruta (ver src/app/api/auth/forgot-password/route.ts).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_password_reset_request_at TIMESTAMPTZ;
