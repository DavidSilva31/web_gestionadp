-- Equipos: las actas de entrega pueden ser cualquier tipo de archivo (PDF, Word, imágenes escaneadas, etc.).
-- El bucket "equipos-actas" solo aceptaba PDF/JPG/PNG de hasta 10 MB: se quita la restricción de tipo y el
-- límite sube a 25 MB (el sistema rechaza ejecutables y scripts, y sigue siendo privado, solo super_admin).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

UPDATE storage.buckets
   SET allowed_mime_types = NULL,
       file_size_limit    = 26214400
 WHERE id = 'equipos-actas';

SELECT id, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id = 'equipos-actas';
