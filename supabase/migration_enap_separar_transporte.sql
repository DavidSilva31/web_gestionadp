-- Cliente ENAP tenía servicios de Almacén y de Transporte mezclados en un
-- solo catálogo (servicios_cliente), de antes de que existiera la columna
-- categoria. Los separa: marca los 15 de transporte como categoria =
-- 'transporte' y los desactiva (activo = false) para que dejen de verse en
-- Servicios Adicionales/HES — quedan en la BD intactos (nombre, tarifa,
-- unidad) para reactivarlos más adelante desde /servicios cuando se
-- ocupen vía Transporte Incomex. Los de Almacén quedan sin tocar
-- (categoria='otro', activo=true).

UPDATE servicios_cliente
SET categoria = 'transporte', activo = false
WHERE id IN (
  '7df93be6-3bba-4c3a-8612-9cc0c1e930bb', -- Transporte a Refinería Aconcagua (hasta 1 tn)
  'ca1845b0-e7e4-4874-b904-d962b5888a13', -- Transporte a Refinería Aconcagua (hasta 2,5 tn)
  '0ee61293-9d2b-4d4d-8d95-6ee6795499c6', -- Transporte a Refinería Aconcagua (hasta 5 tn)
  'b56f0a7f-b4ff-48be-ae4e-4bde2a879a58', -- Transporte a Refinería Aconcagua (hasta 10 tn)
  '09f52688-ba45-471e-81ec-8c1574781908', -- Transporte a Refinería Aconcagua (hasta 20 tn)
  '04c77b28-9e4f-42ac-9215-278cc78da482', -- Transporte a Terminal Quintero (hasta 1 tn)
  '6cbbf238-ef50-48ea-a1a6-2ee1b4937e89', -- Transporte a Terminal Quintero (hasta 2,5 tn)
  'aaa7e5a6-3e29-479c-8616-8d1dcbe80890', -- Transporte a Terminal Quintero (hasta 5 tn)
  'ef88737f-d916-49ed-bb28-2b4c9b3a3f1b', -- Transporte a Terminal Quintero (hasta 10 tn)
  'e5cd348a-ef6a-40b5-b030-4b4a4145451e', -- Recargo transporte Aconcagua hasta 1 TN fuera de horario hábil
  '16aa75bb-41f7-4167-b071-43b3f940092c', -- Recargo transporte Aconcagua hasta 2,5 TN fuera de horario hábil
  'b1c78ae2-271a-4b4e-ab16-8c725d3be4c6', -- Recargo transporte Aconcagua hasta 5 TN fuera de horario hábil
  'f1dd1f52-3c0f-43cd-b57c-32d844c93b2e', -- Recargo transporte Aconcagua hasta 10 TN fuera de horario hábil
  '0efd14f1-52ec-46bb-a36b-5ab1d99fcc66', -- Recargo transporte Aconcagua hasta 20 TN fuera de horario hábil
  '51a7d634-7c0a-45b1-9bf8-b3b3ae8d9674'  -- Recargo transporte Quintero hasta 5 TN fuera de horario hábil
);
