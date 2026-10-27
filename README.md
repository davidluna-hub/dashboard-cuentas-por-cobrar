# AMAO · Cuentas por cobrar

Dashboard en https://davidluna-hub.github.io/dashboard-cuentas-por-cobrar/.

## Uso de las herramientas nuevas

- **Herramientas diarias → Mi día**: prioridades, compromisos atrasados, gestiones y revisiones de crédito.
- **Reportes**: cobros por negocio, Credit Hold, promesas, seguimiento y resumen. Excel, texto e imágenes paginadas para WhatsApp. Los periodos filtran cobros y compromisos; los saldos se identifican como actuales.
- **Calidad de datos**: fechas inconsistentes y contactos sin correo válido; no corrige registros automáticamente.
- **Historial de cambios**: valores anteriores y nuevos; empieza con esta versión.
- **Comprobantes**: archivos privados de hasta 10 MB relacionados con facturas, ingresos, notas y acuerdos.
- **Virtuales HFP**: control documental mensual y exportación XLSX; conserva las facturas originales.
- **Empresa y perfil**: datos del estado de cuenta, cuentas por moneda, roles de usuarios existentes y contraseña propia.
- **Clientes**: programar una revisión de crédito sin ocupar otra tarjeta.

Las promesas se cumplen por ingresos reales del cliente y la misma moneda, aunque se apliquen a otra factura. La fecha real del ingreso debe ser posterior o igual al día local de creación del acuerdo; los pagos previos y los identificados en su base inicial quedan fuera. Un ingreso se consume una sola vez entre compromisos.

Se conserva la captura de facturas por encima del límite con advertencia. Las excepciones de Credit Hold afectan a la publicación; los avisos se controlan por separado en la configuración de cada cliente.

Los correos automáticos permanecen apagados. El interruptor y sus validaciones están preparados; falta finalizar la configuración del proveedor cuando se decida activarlos. El cierre diario de cartera funciona de forma independiente a los correos. No se fabrican cierres de fechas pasadas.

## Código y comprobaciones

Node.js 24 o superior:

```sh
npm ci
npm run build
npm test
```

`app/template.html` conserva la estructura existente. `tools/build.cjs` inserta los módulos y genera `index.html`, servido por GitHub Pages. Los archivos generados de Edge Functions se preparan desde las mismas reglas con `tools/prepare-functions.cjs`.

Los módulos de reglas son `automatic-emails/core.js`, `collection-tools/core.js`, `weekly-reports-core.js` y `operations/core.js`. La conciliación de promesas tiene una implementación compartida.

Las pruebas usan datos sintéticos. Los flujos de interfaz, correos y cortes usan red simulada; el PDF y las tablas PNG se generan con bibliotecas reales. La navegación se prueba con 33 clientes, 800 facturas y 592 aplicaciones, incluidos clics repetidos y actualización de gráficas con Chart.js 4.4.4 real. El Excel se genera con números tipados y texto literal, sin interpretar fórmulas de campos de usuario.

La última revisión se validó con pruebas de código y configuración; no se completó un recorrido visual interactivo en un navegador real.

## Supabase y despliegue

Las migraciones ya aplicadas se conservan en `supabase/migrations/`. `supabase/verify.sql` comprueba permisos y versiones dentro de una transacción que termina en rollback. No deben ejecutarse las migraciones como un script repetible sobre un proyecto que ya las tiene.

- RLS y grants cierran el acceso anónimo; los perfiles limitan las operaciones.
- Cambios de crédito y vencimientos, y cancelaciones con su motivo/sustitución, se confirman en una transacción.
- La cartera compartida usa validación de estructura e importes y una versión esperada. La interfaz conserva cambios pendientes y ofrece revisión de conflictos entre sesiones.
- `ar_operations` contiene datos bancarios y fiscales privados de la empresa, revisiones, virtuales y vínculos documentales, con su propia versión. Las cuentas se leen después de autenticar la sesión y no se incluyen en el código público.
- `ar_audit_log` conserva cambios desde la instalación de esta versión.
- El bucket `amao-documents` es privado y sus enlaces de lectura caducan.
- `amao-reminders` conserva autenticación propia por secreto de trabajo. `amao-portfolio-history` acepta al administrador para un corte manual o el secreto para el programado.

Después de `npm run build`, desplegar `supabase/functions/amao-reminders` y `supabase/functions/amao-portfolio-history` mediante el flujo de Supabase, conservando la autenticación de sus cuerpos. Nunca incluir claves de servicio, del proveedor ni secretos del programador en el repositorio. El cliente usa una clave pública y una sesión autenticada.

GitHub Pages sirve `index.html` desde `main`. Verificar la publicación comparando su SHA-256 con el archivo generado. El estado de la base y los envíos se verifica por separado.

La prueba `operations/check-dom.cjs` carga el HTML completo con jsdom y usa sus controles reales: navegación, filtros de reportes, XLSX/PNG/copia, historial con reintentos, formularios, virtuales y comprobantes. Verifica los estados visibles, la recuperación tras errores y los permisos de consulta. Las escrituras de red y cuenta son simuladas; la animación y el diseño deben revisarse también en un navegador.
