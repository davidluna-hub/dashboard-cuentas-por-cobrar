AMAO | Dashboard de cuentas por cobrar (HTML estático)

ARCHIVOS
- index.html: aplicación completa (HTML + CSS + JavaScript en un solo archivo)
- amao-logo.png: logotipo de AMAO

CONFIGURACIÓN
1. Abre index.html en un editor de texto.
2. Busca las líneas SUPABASE_URL y SUPABASE_ANON_KEY cerca del inicio del script.
3. Sustituye https://TU-PROYECTO.supabase.co por la Project URL de Supabase.
4. Sustituye PEGA_AQUI_TU_ANON_PUBLIC_KEY por la clave anon/public (o publishable) de Supabase.
5. Nunca uses service_role/secret key en este archivo ni la publiques en GitHub.

PUBLICAR EN GITHUB PAGES
1. Crea un repositorio en GitHub.
2. Sube index.html, amao-logo.png y README.txt a la raíz del repositorio.
3. Ve a Settings > Pages.
4. En Build and deployment elige Deploy from a branch.
5. Selecciona la rama main y la carpeta /(root), guarda y espera la publicación.
6. Crea usuarios de acceso desde Supabase > Authentication > Users.

TABLAS ESPERADAS
customers: id, customer_code, legal_name, tax_id, email, phone, active, notes
invoices: id, customer_id, invoice_number, source, invoice_date, due_date, currency, subtotal, tax, total, status, external_reference, notes, business_line
payments: id, invoice_id, payment_date, amount, currency, payment_method, reference, notes

IMPORTANTE
- Supabase debe tener políticas RLS correctas para SELECT e INSERT de usuarios autorizados.
- No desactives RLS para resolver errores de permisos.
- Los saldos se calculan como total de factura menos pagos asociados.
- Credit hold es una señal para revisión a partir de 60 días vencidos; no bloquea automáticamente al cliente.
- El indicador de cumplimiento muestra facturas liquidadas vs. con saldo, no pago puntual.
- Si tu esquema usa columnas o restricciones diferentes, ajusta las consultas/valores en index.html.
- La clave pública de Supabase puede estar en el frontend solo si RLS protege correctamente las tablas.
