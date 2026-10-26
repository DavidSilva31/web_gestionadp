-- WILHELMSEN SHIPS SERVICE (CHILE) SPA: limpiar todo su inventario y volver a cargarlo desde
-- docs/PLANTILLA INV WILH. - INSUMOS.xlsx (hoja "Hoja1", 198 filas).
--
-- 1) Se eliminan TODOS los movimientos del cliente (262, ninguno viene de un report) y TODOS sus
--    productos (301, incluidos 5 inactivos). El cliente no tiene reports ni comparte stock.
-- 2) Se cargan 197 productos nuevos: cada fila de la planilla es un producto
--    "NOMBRE (CÓDIGO)" con SKU = CÓDIGO, IMO/NU "NA", Carga general, Bodega General, y un
--    movimiento de ingreso de carga inicial con bodega CONTENEDOR, 0 posiciones y las unidades de
--    la columna STOCK UND (1063 en total). Envase "PCS" no existe en el catálogo de envases del
--    sistema, así que el movimiento queda sin envase. Peso neto (columna PESO NETO) va como peso del
--    movimiento cuando es mayor que 0 (140 filas).
--  * Código 2009032 (NAVADAN DIAPHRAGM KIT) está 2 veces con el mismo nombre (11 und. sin peso y
--    1 und. de 157): queda un solo producto con 2 movimientos.
--  * Código 636431 está 2 veces con nombres distintos (3/8-5/8 COLLECTION OF FITTINGS e INSUMOS):
--    quedan 2 productos, con el mismo SKU.
--  * 1 fila sin unidades (UWI-150 TP WELDING INVERTER IN CASE): queda el producto sin movimientos.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase (si pregunta por RLS de la tabla temporal,
-- elegir "Run without RLS"). Va en una transacción: si la verificación final falla, se deshace todo.

BEGIN;

DELETE FROM movimientos      WHERE cliente_id = 'aac14469-2667-42eb-b24f-cf3230c85fe4';
DELETE FROM inventario_items WHERE cliente_id = 'aac14469-2667-42eb-b24f-cf3230c85fe4';

CREATE TEMP TABLE _wilh (codigo TEXT, nombre TEXT, unidades INT, peso NUMERIC) ON COMMIT DROP;
INSERT INTO _wilh VALUES
  ('2009032', 'NAVADAN DIAPHRAGM KIT', 11, 0),
  ('743466', 'TRATAMIENTO DE AIRE PARA CONDUCTOS', 3, 0),
  ('592568', 'SPRAY GUN 1 LTR', 5, 0),
  ('607443', 'NON-SPARKING PLASTIC SPATULA', 7, 0),
  ('607442', 'PLASTIC SCOOP-MEDIUM SIZE', 2, 0),
  ('778415', 'TURBIDITY TUBE', 15, 0),
  ('632976', 'WIRE BRUSH STEEL. 6PCS', 3, 0),
  ('777071', 'INSUMOS', 2, 0),
  ('632414', 'INSUMOS', 10, 0),
  ('743476', 'MAGNET & VOLT STICKS PACK', 37, 0),
  ('320184', 'CHARGING HOSE - 1.8M, 1/4" FLARE', 37, 0),
  ('320200', 'INSUMOS', 19, 0),
  ('777935', 'CHLORINE DPD NO.3TOTAL250 TESTS', 18, 0),
  ('777936', 'PHENOL REDPH 250 TESTS', 10, 0),
  ('625066', 'INSUMOS', 2, 0),
  ('778861', 'PERMANGANATE VALUE TEST KIT', 2, 0),
  ('778414', 'DILUTION POTS 40 PCS', 4, 0),
  ('739466', 'SPECTRAPAK 309', 1, 0),
  ('708050', 'DETECTOR NEW GR230-HFC-4000', 1, 0),
  ('636431', '3/8-5/8 COLLECTION OF FITTINGS', 2, 0),
  ('150151', 'REMOTE CONTROL FOR UWI-150 TP', 2, 0),
  ('729632', 'PH BUFFER 7 & 10 REPLACEMENT PACK', 5, 0),
  ('555565', 'LOVIBOND 2000 COMPARATOR', 2, 0),
  ('619973', 'MINIMIX PURE NITROGEN', 2, 0),
  ('620138', 'MINIMIX 58 HYDROGEN SULPHIDE', 5, 0),
  ('174656', 'SHANK W/NON-RETURN VALVES', 1, 0),
  ('619205', 'REGULATOR 510 AC PRESSURE 0-1.5 BAR', 1, 0),
  ('624434', 'BALLOON FILL REGULATOR WITH GAUGE', 5, 0),
  ('778483', 'BALLOON FILL REGULATOR WITH GAUGE', 1, 0),
  ('777074', 'CHLORINE/BROMINE CHECKIT KIT', 1, 0),
  ('778163', 'COLITAG THIO BAGS 25', 3, 0),
  ('708545', 'FLASHBACK ARRESTOR S55 OX', 3, 0),
  ('708537', 'FLASHBACK ARRESTOR S55 AC', 3, 0),
  ('603068', 'UNITOR RANGE OF GAS WELDING', 3, 0),
  ('778461', 'INSUMOS', 3, 0),
  ('603043', 'UNITOR RANGE OF GAS WELDING', 6, 0),
  ('603050', 'INSUMOS', 10, 0),
  ('550152', 'INSUMOS', 6, 0),
  ('550160', 'EASYCLEAN CLEANING & DISINFECTANT 10', 5, 0),
  ('174698', 'CUTTING NOZZLE 3- 10MM', 11, 0),
  ('174706', 'CUTTING NOZZLE 10- 25MM', 5, 0),
  ('174730', 'GOUGING NOZZLE', 6, 0),
  ('174722', 'CUTTING NOZZLE 50-100MM', 21, 0),
  ('174714', 'CUTTING NOZZLE 25- 50MM', 2, 0),
  ('5100311', 'REGULATOR 530 OX PRESSURE 0-10 BAR', 2, 0),
  ('604850', 'UNITOR RANGE OF RODS AND FLUXES', 1, 0),
  ('725309', 'UNITOR RANGE OF RODS AND FLUXES', 3, 0),
  ('335547', 'INSUMOS', 3, 0),
  ('233601', 'UNITOR RANGE OF GAS WELDING', 2, 0),
  ('699272', 'UNITOR RANGE OF MAINTENANCE ELECTR', 13, 0),
  ('699348', 'UNITOR RANGE OF MAINTENANCE ELECTR', 7, 0),
  ('699405', 'UNITOR RANGE OF MAINTENANCE ELECTR', 5, 0),
  ('699173', 'UNITOR RANGE OF MAINTENANCE ELECTR', 6, 0),
  ('606401', 'INSUMOS', 6, 0),
  ('683656', 'UNITOR RANGE OF MAINTENANCE ELECR', 1, 0),
  ('699249', 'UNITOR RANGE OF MAINTENANCE ELECR', 1, 0),
  ('683649', 'UNITOR RANGE OF MAINTENANCE ELECR', 16, 0),
  ('674710', 'TUNGSTEN EL. 1.6MM. 10PCS', 4, 0),
  ('661778', 'PICKLING GEL 2L F/STAINLESS STEEL', 29, 1),
  ('599264', 'UNITOR RANGE OF MAINTENANCE ELECTR', 9, 2),
  ('758466', 'UNITOR RANGE OF MAINTENANCE ELECTR', 6, 3),
  ('699538', 'UNITOR RANGE OF MAINTENANCE ELECTR', 11, 4),
  ('599165', 'UNITOR RANGE OF MAINTENANCE ELECTR', 14, 5),
  ('758474', 'UNITOR RANGE OF MAINTENANCE ELECTR', 3, 6),
  ('766412', 'PH ELECTRODE STORAGE SOLN. 100ML', 2, 9),
  ('699512', 'UNITOR RANGE OF MAINTENANCE ELECTR', 13, 10),
  ('632406', 'TBN REAGENT PACK', 4, 13),
  ('779032', 'INSUMOS', 2, 14),
  ('621565', 'AC LOW PRESS.CONNECTOR W/PREW.UNION', 1, 15),
  ('627877', 'EL.HOLDER 200A WITH DIX25 CONNECTOR', 3, 16),
  ('671701', 'AIR HOSE, PVC', 6, 17),
  ('568873', 'PH REAGENT FOR 311 KIT', 12, 18),
  ('777934', 'CHLORINE DPD NO 1 FREE 250 TESTS', 10, 19),
  ('698753', 'DEHA TEST TABLETS REFILL REAGENT 2 X 100', 5, 20),
  ('698761', 'DEHA TEST SOLUTION REFILL REAGENT', 1, 21),
  ('778645', 'IRON LR TABLETS 100', 1, 22),
  ('778413', 'BACTERIA PLATES 40 PCS', 9, 24),
  ('2009033', 'NAVADAN SUBMERSIBLE KIT', 3, 26),
  ('555664', 'P-ALKALINITY TABLETS 2 BOTTLES X 250', 4, 27),
  ('778419', 'POTABLE WATER TEST KIT', 5, 29),
  ('555623', 'NITRITE NO.1 TABLETS 2 BOTTLES X 100', 2, 30),
  ('555649', 'PHOSPHATE TABLETS 2 BOTTLES X 100', 2, 31),
  ('411259', 'TIMM CHAFE GUARD', 1, 32),
  ('1000627', 'INSUMOS', 3, 34),
  ('627885', 'EL.HOLDER 200A WITH DIX70 CONNECTOR', 5, 35),
  ('779048', 'SPARK PROTECTOTR F/AUTODARK 820 - B5', 19, 36),
  ('779047', 'PREFILTER F/AUTODARK 820 - B4', 3, 37),
  ('1000399', 'INSUMOS', 1, 38),
  ('673154', 'UNITOR EASYSHIP COMBINED TEST KIT', 2, 39),
  ('755775', 'HR TOTAL HARDNESS TEST KIT', 8, 40),
  ('777932', 'E.COLI/COLIFORM 25 TESTS', 10, 41),
  ('638489', 'INSUMOS', 2, 45),
  ('698928', 'INSUMOS', 1, 46),
  ('777051', 'CHLORIDE TITRANT MBC2X2 65 ML', 3, 47),
  ('778417', 'COLOUR DISC', 2, 48),
  ('778420', 'CHECKIT COMPARATOR', 3, 49),
  ('778418', '40MM CELLS F COLOUR MEASUREMENT', 5, 50),
  ('777068', 'PH TEST STRIPS 2 PACK MO319', 7, 53),
  ('555730', 'FILTER PAPER 2 BOXES X 100', 2, 55),
  ('777084', 'PHOSPHATE DISC MO356 0 - 20PPM', 1, 56),
  ('555680', 'HYDRAZINE TEST POWDER 2 BOTTLES X 30G', 2, 57),
  ('778647', 'CHECKIT COPPER DISC 0 TO 5MG/L', 3, 58),
  ('778422', 'CHECKIT PH DISC 6.8 TO 8.4', 2, 59),
  ('778421', 'CHECKIT FREE CHLORINE DISC', 3, 61),
  ('698936', '30 ML AMBER GLASSBOTTLE', 4, 62),
  ('777094', 'FILTER PAPER HOLDER MO370.', 3, 63),
  ('735738', 'COOLTREAT SHAKER TUBE', 2, 64),
  ('778113', 'TITRATOR JAR 40 ML', 2, 65),
  ('698944', '60 ML SAMPLE BOTTLE', 1, 66),
  ('568683', 'STD CONDUCTIVITY SOLN FOR CALIBRATN', 1, 67),
  ('625749', 'INSOLUBLES TEST KIT', 4, 68),
  ('777093', '20ML FILTER SYRINGE MO369.', 5, 69),
  ('175273', 'WELD.GOGGLES W/LIFT-FRONT', 12, 70),
  ('633263', 'SHADE 11 GLASS. 5SET', 6, 71),
  ('633271', 'SHADE 12 GLASS. 5 SET', 7, 72),
  ('633214', 'PROTECTION GLASS. 10PCS', 10, 73),
  ('633248', 'SHADE 9 GLASS. 5SET', 2, 74),
  ('587199', 'REFRIGERANT LEAK DETECTION U.V.TRACER', 2, 75),
  ('739490', 'SPECTRAPAK 315', 1, 76),
  ('500000', 'UCT-500 COMBINATION TORCH MASTER', 3, 77),
  ('711473', 'DELUXE MANIFOLD SET 4-WAY', 1, 78),
  ('721381', 'UNITOR EXTREME HP 500BAR HOSE 25M', 1, 79),
  ('671818', 'UNITOR HEAVY DUTY HOSE 250BAR BLUE 25M', 1, 80),
  ('5240031', 'INSUMOS', 1, 81),
  ('2009027', 'NAVADAN APPLICATOR KIT', 1, 82),
  ('3052921', 'INSUMOS', 1, 83),
  ('203203', 'UWI-203 TP WELDING INVERTER', 13, 84),
  ('632893', 'CABLE CONNECTOR DIX70 MALE-FEMALE', 5, 86),
  ('178640', 'INSUMOS', 2, 87),
  ('632968', 'WELDERS CHALK. FLAT', 5, 88),
  ('551135', 'TIG NOZZLE 6 FOR TIG-TORCH', 4, 89),
  ('551127', 'TIG NOZZLE 7 FOR TIG-TORCH', 2, 90),
  ('729218', 'INSUMOS', 2, 91),
  ('636431', 'INSUMOS', 3, 92),
  ('734038', 'INSUMOS', 9, 93),
  ('191676', 'USH SOCKET', 7, 94),
  ('191692', 'USH SOCKET', 14, 95),
  ('633206', 'SPARE FLINT SET. 10 PCS', 11, 96),
  ('633354', 'SHADE 7 GLASS. 10 PCS', 3, 97),
  ('720132', 'HPCE DYNAMIS 500+/ROTOR NOZZLE/440V', 3, 99),
  ('743195', 'INSUMOS', 4, 100),
  ('743203', 'INSUMOS', 4, 101),
  ('768416', 'CLAMP 1 EAR 12,3-14,3MM 1/4" HOSE 20PC', 1, 102),
  ('768507', 'INSUMOS', 1, 103),
  ('633198', 'GAS IGNITOR TRIPL. 2 PCS', 2, 104),
  ('607810', 'TIG TORCH ACCESSORIES KIT', 1, 105),
  ('550194', 'WORKING GAUGE OX 0-16 BAR', 4, 108),
  ('708550', 'FLASHBACK ARRESTOR W-66S OXYGEN', 1, 112),
  ('721209', 'HPCE 520/POWERSPEED ATTACHMENT', 4, 113),
  ('653899', 'RETURN CLAMP 400A.', 7, 114),
  ('183970', 'INSUMOS', 14, 115),
  ('320192', 'INSUMOS', 3, 116),
  ('175612', 'HOSE JOINT F/9MM 3/8 INCHOX HOSE', 7, 117),
  ('175604', 'HOSE JOINT F/9MM 3/8 INCHAC HOSE', 9, 118),
  ('320218', 'INSUMOS', 14, 119),
  ('633230', 'SHADE 8 GLASS. 5SET', 12, 120),
  ('633222', 'SAFETY GLASS. 10PCS', 1, 121),
  ('59140', 'INSUMOS', 2, 122),
  ('6402024', 'TAKE OFF VALVE 6402024 CHR. PLATED BRASS', 1, 123),
  ('669358', 'INSUMOS', 8, 124),
  ('191833', 'UPH PLUG', 2, 125),
  ('160001', 'GAS NOZZLE FOR UWW-160', 3, 126),
  ('729442', 'HOSE CLAMP FOR 1/4" HOSE 10 PCS', 2, 127),
  ('191684', 'USH SOCKET', 15, 128),
  ('191858', 'UPH PLUG', 3, 129),
  ('191890', 'UPM PLUG', 43, 130),
  ('191874', 'UPM PLUG', 9, 131),
  ('191841', 'UPH PLUG', 2, 132),
  ('174599', 'WELDING ATTACHMENT 400 L', 1, 133),
  ('174581', 'WELDING ATTACHMENT 230 L', 1, 134),
  ('674736', 'TUNGSTEN EL. 2.4MM. 10PCS', 1, 136),
  ('722827', 'INSUMOS', 1, 137),
  ('722835', 'INSUMOS', 3, 138),
  ('551184', 'COLLET BODY 1,6MM FOR TIG-TORCH', 1, 139),
  ('552497', 'ELECTRODE HOLDER TWISTY 200AMP', 12, 140),
  ('633008', 'CHIPPING HAMMER ST. 2PCS', 10, 141),
  ('105050', 'INSUMOS', 13, 142),
  ('728766', 'NEEDLES 3MM FOR NS-PRO SERIES', 3, 143),
  ('599272', 'UNITOR RANGE OF MAINTENANCE ELECT', 3, 144),
  ('175935', 'LEATHER CUFFS PAIR', 19, 145),
  ('777121', 'NITRITE INDICATOR MN1X2', 3, 147),
  ('568568', 'BACTERIA COUNT TEST 10 PCS', 1, 150),
  ('550178', 'CONTENTS GAUGE OX/AR 0-400 BAR', 2, 151),
  ('234807', 'CUTTING ATTACHMENT 90 DGR', 2, 152),
  ('174573', 'WELDING ATTACHMENT 80L.', 2, 154),
  ('535070', 'CHARG/VACUUM HOSE-1.8M, 3/8" FLARE', 7, 155),
  ('633255', 'SHADE 10 GLASS. 5SET', 1, 156),
  ('2009032', 'NAVADAN DIAPHRAGM KIT', 1, 157),
  ('2009026', 'NAVADAN ESSENTIAL KIT', 5, 158),
  ('602979', 'UNITOR RANGE OF RODS AND FLUXES FOR', 1, 159),
  ('233551', 'UNITOR RANGE OF GAS WELDING AND', 1, 161),
  ('150150', 'UWI-150 TP WELDING INVERTER IN CASE', 0, 162),
  ('203205', 'SPARE PART KIT FOR UWI-203TP', 2, 167),
  ('718247', 'INSUMOS', 2, 169),
  ('623603', 'TAKE OFF VALVE 6402024 CHR. PLATED BRASS', 1, 170),
  ('2009018', 'INSUMOS', 5, 171),
  ('510000', 'REGULATOR 510 OX PRESSURE 0-10 BAR', 7, 172),
  ('699421', 'UNITOR RANGE OF MAINTENANCE ELECTR', 1, 173);

-- 1) Un producto por (código, nombre)
INSERT INTO inventario_items
  (cliente_id, descripcion, codigo, categoria, area, clase_imo, nu, unidad, stock_actual, stock_unidades, activo)
SELECT DISTINCT 'aac14469-2667-42eb-b24f-cf3230c85fe4'::uuid, w.nombre || ' (' || w.codigo || ')', w.codigo,
       'Carga general', 'Bodega General', 'NA', 'NA', 'unidad', 0, 0, TRUE
FROM _wilh w;

-- 2) Un ingreso por fila con unidades (el trigger suma el stock al producto)
INSERT INTO movimientos
  (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
   unidades, posiciones, operador, estado, codigo, imo, un, bodega, peso_envase, fecha)
SELECT 'ingreso', 'Almacenaje', c.id, c.nombre, i.descripcion, 'Bodega General', i.id,
       w.unidades, 0, 'Carga inicial', 'completado', w.codigo, 'NA', 'NA', 'CONTENEDOR', NULLIF(w.peso, 0), NOW()
FROM _wilh w
JOIN clientes c ON c.id = 'aac14469-2667-42eb-b24f-cf3230c85fe4'
JOIN inventario_items i ON i.cliente_id = c.id AND i.descripcion = w.nombre || ' (' || w.codigo || ')'
WHERE w.unidades > 0;

-- 3) Verificación: 197 productos, 197 movimientos, 0 posiciones y 1063 unidades
DO $$
DECLARE v_items INT; v_movs INT; v_pos INT; v_und INT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(stock_actual), 0), COALESCE(SUM(stock_unidades), 0)
    INTO v_items, v_pos, v_und FROM inventario_items WHERE cliente_id = 'aac14469-2667-42eb-b24f-cf3230c85fe4';
  SELECT COUNT(*) INTO v_movs FROM movimientos WHERE cliente_id = 'aac14469-2667-42eb-b24f-cf3230c85fe4';
  IF v_items <> 197 OR v_movs <> 197 OR v_pos <> 0 OR v_und <> 1063 THEN
    RAISE EXCEPTION 'Verificación fallida: % productos, % movimientos, % posiciones, % unidades (se esperaban 197, 197, 0 y 1063)',
      v_items, v_movs, v_pos, v_und;
  END IF;
END $$;

COMMIT;

-- Resultado (opcional)
SELECT COUNT(*) AS productos, SUM(stock_unidades) AS unidades FROM inventario_items
WHERE cliente_id = 'aac14469-2667-42eb-b24f-cf3230c85fe4';
