# Revisión del módulo Comercial — 6 de octubre de 2026

## Hallazgos y correcciones

- Las partidas de kits se estaban sumando junto con sus componentes. Se utilizan los componentes para atribuir marca y línea, conservando el importe de la factura una sola vez.
- Los periodos consultan FECHAELAB; cuando SAE no registra ese campo, se utiliza FECHA_DOC. Se excluyen facturas con STATUS=C.
- Cada factura concilia su subtotal neto y total con FACTF15 antes de aplicar marca/línea. Se distribuyen los centavos de redondeo antes de filtrar para conservar los importes entre consultas.
- Las marcas proceden de INVE_CLIB15.CAMPLIB1; las líneas, de INVE15.LIN_PROD; el vendedor, de FACTF15.CVE_VEND. Los clientes proceden de FACTF15.CVE_CLPV y CLIE15.NOMBRE.
- Se agrupan variantes de mayúsculas/minúsculas y espacios de la misma marca, y se permite filtrar Sin marca.
- Los importes de la interfaz muestran centavos. La gráfica representa la participación real en el importe sin IVA, sin inflar las barras pequeñas.
- La matriz incluye totales por columna y global. Su buscador admite acentos y palabras en distinto orden, y solo filtra la tabla, con un total explícito de la búsqueda.
- Se impide que respuestas anteriores reemplacen la consulta vigente; durante carga o error no se presentan cifras anteriores como si pertenecieran a los nuevos filtros.

## Validación con la base de datos, independiente de la API

| Consulta | Facturas | Sin IVA | Con IVA |
| --- | ---: | ---: | ---: |
| Hoy | 39 | $218,253.82 | $252,917.28 |
| Octubre al día 6 | 129 | $578,022.18 | $669,728.91 |
| Últimos 30 días | 836 | $6,388,930.11 | $7,406,893.72 |
| Septiembre | 824 | $6,826,981.16 | $7,915,300.81 |
| Año al día 6 | 7,600 | $53,220,134.60 | $61,707,810.53 |

También conciliaron las consultas de los vendedores 1, 7, 18 y 21. Se probaron las 75 marcas presentes en los últimos 30 días, cinco clientes, tres líneas reales del catálogo y combinaciones de marca/línea. Las sumas de filas y columnas coinciden con los indicadores de cada respuesta; el número global de facturas se calcula por documento distinto (una factura puede contener varias marcas).

Compilación API y web correctas. Cinco pruebas automatizadas del filtro Commercial aprobadas. Se comprobó la vista en tema claro y oscuro y la combinación vendedor 7 / SPINREACT: $13,089.00 sin IVA, $15,183.24 con IVA, ocho facturas y ocho clientes.

Esta revisión verifica facturación vigente. Las metas y comisiones aún no están configuradas. Las marcas y líneas reflejan el catálogo actual de SAE.

Los resultados corresponden al estado de la base de datos durante la revisión. Se mantiene la consulta en vivo, sin una caché que oculte cambios de SAE.
