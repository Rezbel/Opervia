/* SAE empresa 15. Consulta de SOLO LECTURA.
   Saldo pendiente con IVA = SUM(IMPORTE * SIGNO) de CUEN_M15 y CUEN_DET15.
   Se agrupa por cliente + referencia + numero de cargo (incluye cargo 0).
   Se redondea cada saldo de cargo a 2 decimales antes de sumar.
   Solo facturas/cargos con saldo positivo, no cancelados.
   No se vuelve a agregar IVA: se usa el importe de cuentas por cobrar.
   Sin filtro de fechas ni vendedor: toda la cartera pendiente actual.
   Esto no equivale a SUM(CLIE15.SALDO), que incluye saldos a favor y otros movimientos.
*/
WITH MOVIMIENTOS AS (
    SELECT CVE_CLIE, REFER, NUM_CARGO, NO_FACTURA,
           FECHA_VENC, STATUS,
           CASE WHEN NUM_CPTO = 1 AND SIGNO = 1 THEN 1 ELSE 0 END AS ES_FACTURA,
           COALESCE(IMPORTE, 0) * COALESCE(SIGNO, 0) AS IMPORTE_FIRMADO
    FROM CUEN_M15

    UNION ALL

    SELECT CVE_CLIE, REFER, NUM_CARGO, NULL,
           NULL, NULL, 0,
           COALESCE(IMPORTE, 0) * COALESCE(SIGNO, 0)
    FROM CUEN_DET15
), CUENTAS AS (
    SELECT CVE_CLIE, REFER, NUM_CARGO,
           MAX(NO_FACTURA) AS NO_FACTURA,
           MIN(FECHA_VENC) AS FECHA_VENC,
           MAX(STATUS) AS STATUS,
           MAX(ES_FACTURA) AS ES_FACTURA,
           CAST(ROUND(SUM(IMPORTE_FIRMADO), 2) AS DECIMAL(18, 2)) AS SALDO
    FROM MOVIMIENTOS
    GROUP BY CVE_CLIE, REFER, NUM_CARGO
), PENDIENTES AS (
    SELECT M.CVE_CLIE, M.REFER, M.NUM_CARGO,
           COALESCE(NULLIF(TRIM(M.NO_FACTURA), ''), TRIM(M.REFER), '') AS FACTURA,
           TRIM(C.CLASIFIC) AS CLASIFICACION,
           COALESCE(M.FECHA_VENC, F.FECHA_VEN) AS VENCIMIENTO,
           M.SALDO
    FROM CUENTAS M
    LEFT JOIN CLIE15 C
           ON C.CLAVE = M.CVE_CLIE
    LEFT JOIN FACTF15 F
           ON F.CVE_DOC = M.NO_FACTURA
          AND F.CVE_CLPV = M.CVE_CLIE
    WHERE M.SALDO > 0
      AND (F.CVE_DOC IS NOT NULL OR M.ES_FACTURA = 1)
      AND COALESCE(TRIM(F.STATUS), '') <> 'C'
      AND COALESCE(TRIM(M.STATUS), '') <> 'C'
      /* Para replicar un periodo de Programacion, descomenta ambas condiciones.
         El filtro es por VENCIMIENTO de cada cargo, no por elaboracion.
      AND CAST(COALESCE(M.FECHA_VENC, F.FECHA_VEN) AS DATE) >= DATE '2026-10-07'
      AND CAST(COALESCE(M.FECHA_VENC, F.FECHA_VEN) AS DATE) <= DATE '2026-10-31'
      */
)
, AGRUPACION AS (
    SELECT P.*,
           CASE
               WHEN CLASIFICACION STARTING WITH 'Q' THEN 'Queretaro'
               WHEN CLASIFICACION STARTING WITH 'S' THEN 'San Luis Potosi'
               WHEN CLASIFICACION STARTING WITH 'H' THEN 'Huasteca'
               WHEN CLASIFICACION STARTING WITH 'X' THEN 'Xalapa'
               ELSE 'Sin sucursal por clasificacion'
           END AS SUCURSAL
    FROM PENDIENTES P
)
SELECT SUCURSAL,
       COUNT(*) AS CARGOS_PENDIENTES,
       COUNT(DISTINCT TRIM(CVE_CLIE) || '|' || FACTURA) AS FACTURAS_PENDIENTES,
       SUM(SALDO) AS SALDO_PENDIENTE_CON_IVA
FROM AGRUPACION
GROUP BY SUCURSAL
ORDER BY SUCURSAL;
