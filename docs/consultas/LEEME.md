# Comparación de sucursales en SAE

Estas consultas son para Firebird y la empresa **15**. Son consultas de lectura: no cambian tablas ni datos. Copia todo el contenido de un archivo `.sql` en el editor de consultas conectado a la misma base de SAE y ejecútalo como una consulta independiente.

- **01_sucursal_por_cliente.sql:** toma `CLIE15.CLASIFIC`. Q = Querétaro, S = San Luis Potosí, H = Huasteca, X = Xalapa. Las demás clasificaciones quedan en una fila separada.
- **02_sucursal_por_factura.sql:** toma el folio de factura asociado al cargo: `CUEN_M15.NO_FACTURA`; si está vacío, usa `CUEN_M15.REFER`. F-QR = Querétaro, F-SL = San Luis Potosí, F-HT = Huasteca, F-XA = Xalapa. Otras series quedan en una fila separada, sin asignar una sucursal por suposiciones.
- **03_facturas_con_diferencia_de_sucursal.sql:** muestra cliente, clasificación, factura, las dos sucursales y el saldo pendiente donde las asignaciones difieren. También incluye series y clasificaciones sin asignar. Suma los plazos pendientes de cada documento; no muestra los cargos liquidados.

## De dónde sale el saldo

1. `CUEN_M15`: movimientos principales de cuentas por cobrar. Se toma `IMPORTE * SIGNO`.
2. `CUEN_DET15`: aplicaciones, pagos y reducciones vinculadas al cargo. También se toma `IMPORTE * SIGNO`, conservando el signo registrado en SAE.
3. Se unen los movimientos y se suman por **CVE_CLIE + REFER + NUM_CARGO**. Así, el pago de un plazo no liquida automáticamente todos los demás. El cargo 0 se conserva si todavía tiene saldo positivo.
4. Se redondea el saldo de cada cargo a dos decimales y se suman únicamente los saldos positivos de facturas no canceladas. `FACTF15`, por `CVE_DOC` y `CVE_CLPV`, identifica el documento y su estado; también se reconocen los cargos de factura por concepto 1 con signo positivo.
5. El importe de cartera ya incluye los impuestos registrados. No se calcula un IVA adicional ni se suma el subtotal de `FACTF15` por cada plazo.

Ambas consultas usan exactamente la misma cartera. Cambia únicamente la agrupación por sucursal. **Sumando todas las filas, incluidas las filas sin asignar, el total de ambos resultados debe coincidir.**

`CARGOS_PENDIENTES` cuenta los plazos con saldo. `FACTURAS_PENDIENTES` cuenta documentos distintos por cliente, aunque tengan varios plazos. Los conteos por sucursal pueden cambiar cuando la clasificación y el folio asignan sucursales distintas.

El total de facturas pendientes no es necesariamente igual a `SUM(CLIE15.SALDO)`: el saldo neto del catálogo puede incluir anticipos, saldos a favor y otros movimientos que estas consultas no distribuyen entre facturas.

## Cómo comparar un periodo

Las consultas vienen **sin filtro de fechas** para comparar toda la cartera pendiente actual. Dentro de `PENDIENTES` están comentadas dos condiciones de fechas. Descoméntalas y establece el mismo rango en ambos archivos para comparar Programación de vencimientos.

El filtro toma `CUEN_M15.FECHA_VENC` del cargo y, cuando no existe, `FACTF15.FECHA_VEN`. Es una fecha de vencimiento, no una fecha de elaboración. Los cargos sin vencimiento quedan fuera cuando activas ese filtro.

La prueba del 8 de octubre de 2026 devolvió **$11,320,339.67** en ambas consultas de agrupación; el total también coincidió con el módulo en ese momento. Los resultados cambian cuando se registran nuevos documentos, abonos o cancelaciones. Las consultas representan el estado actual de la cartera, no una reconstrucción histórica del saldo a otra fecha.
