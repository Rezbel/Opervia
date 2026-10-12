# Opervia

## Dirección móvil

El proyecto mantiene la web y prepara una experiencia móvil con prioridad en
Android: primero adaptación táctil y acceso instalable por web para el piloto,
después cliente Android con Capacitor y la misma API. iPhone puede utilizar la
vía web y queda previsto como destino nativo posterior. El plan, requisitos de
autenticación y criterios de validación están en [Opervia móvil](docs/mobile-roadmap.md).
Esta dirección todavía no constituye una PWA habilitada ni un APK generado.

## Arranque en Windows

Haz doble clic en `Iniciar Opervia.cmd`. El iniciador compila la API, inicia
los servicios y abre http://localhost:5173/. Los registros quedan en `.run/`.
También puedes ejecutar `scripts/start-local.ps1` desde PowerShell.

## Navegación

Cada módulo tiene su propia dirección: `/centro-de-control`, `/flujos`,
`/cuentas-por-cobrar`, `/cobranza`, `/vencimientos`, `/rentabilidad`,
`/comercial`, `/clientes` y `/chat-ia`. Configuración usa
`/configuracion/conexion`, `/configuracion/usuarios` y `/configuracion/permisos`;
el panel de usuarios del Centro de control usa `/centro-de-control/usuarios`.
Recargar conserva la sección y Atrás/Adelante recorre las páginas visitadas.
Si se necesita iniciar sesión, al entrar se vuelve a la dirección solicitada.
Los permisos se verifican también al abrir una dirección directamente.

Los servidores Vite del arranque local y de red sirven `index.html` para las
rutas de la aplicación. Otro servidor de publicación debe tener el mismo
fallback, excluyendo `/api` y los archivos estáticos.

## Acceso desde la red local

Haz doble clic en `Iniciar Opervia en red.cmd` para publicar la aplicación en
el puerto 10. Desde los otros equipos usa `http://IP-DEL-SERVIDOR:10/`; el
iniciador muestra las direcciones disponibles. La dirección actual de esta
red es `http://192.168.80.81:10/`.

El iniciador compila la interfaz y dirige sus consultas a la API local desde
la misma dirección, conservando el login y los permisos. La API permanece
en el puerto local 5106. Los registros del acceso de red quedan en
`.run/network-10.out.log` y `.run/network-10.err.log`.

Para otro puerto o una sola dirección de red, usa por ejemplo
`scripts/start-network.ps1 -Port 8080 -ListenAddress 192.168.80.81`.
El equipo servidor y sus servicios deben permanecer encendidos. Si cambia
la IP del equipo, cambia también la dirección que usan los demás equipos.
Windows debe permitir el puerto elegido para Node.js en el firewall de la red.

En Development, si `OperviaStorage:ConnectionString` no está configurada,
los perfiles y movimientos manuales se guardan en `src/Opervia.Api/App_Data/`.
Las contraseñas se cifran con .NET Data Protection. Conserva también las claves
Data Protection del usuario al respaldar esos datos. Al configurar MySQL se
usa el almacenamiento original; los datos locales no se migran automáticamente.
Ollama es opcional para abrir la interfaz; la IA requiere el servicio y el modelo
`qwen3:4b`. Las consultas a SAE requieren configurar tu servidor Firebird.

Opervia reconstruye flujos de venta de Aspel SAE mediante una API .NET y
una interfaz React. La solución separa dominio, aplicación, infraestructura,
API, worker y pruebas.

## Acceso y usuarios

El acceso usa correo y contraseña. Administrador y Gerencia administran cuentas
desde Centro de control; Gerencia no puede crear ni editar administradores.
Solo Administrador configura las conexiones de SAE. Ejecutivo ve Centro de
control, Flujos, Cuentas por cobrar, Comercial y Clientes; no ve Rentabilidad,
Chat IA ni Análisis visual de cobranza.

Cada Ejecutivo requiere una o más claves del catálogo real de SAE. Con una,
la clave permanece fija; con varias, puede consultar una o todas sus claves.
La API aplica los permisos y restringe consultas, expedientes, partidas y totales.
En Clientes, el límite de crédito es el del catálogo; el saldo del Ejecutivo
corresponde a movimientos de sus vendedores, no al saldo global del cliente.

En una instalación nueva configura `Auth__BootstrapPassword` mediante una variable
de entorno del servidor o .NET User Secrets para crear `sistemas@qrq.com.mx`.
Como alternativa local, `App_Data/bootstrap-admin.json` puede contener
`{"password":"<contraseña inicial>"}` y se elimina después de crear el administrador.
No guardes contraseñas en el repositorio. Las cuentas se conservan en
`src/Opervia.Api/App_Data/users.json`, con contraseñas hasheadas. Respáldalo junto
con las claves de Data Protection del servidor; no borres este archivo al actualizar.
Este almacenamiento de usuarios es local al servidor, incluso si los perfiles usan MySQL.

La sesión usa cookie HttpOnly; Recordarme permite conservarla durante 30 días
con renovación por actividad. Sin Recordarme dura hasta 8 horas y la cookie es
de sesión. El formulario permite el administrador de contraseñas del navegador;
Opervia no guarda la contraseña en localStorage. Cambiar permisos, contraseña o
estado de una cuenta revoca sus sesiones anteriores. En producción usa HTTPS
para las cookies seguras y conserva el mismo servidor/claves de Data Protection.

## Seguridad de Firebird

- El código de infraestructura contiene únicamente consultas `SELECT`.
- Las pruebas unitarias usan dobles en memoria y no abren conexiones.
- Las credenciales Firebird se guardan solamente cuando el usuario usa un
  perfil. La contraseña se cifra antes de persistirla en MySQL y nunca se
  almacena en texto plano.
- Fuera de `Development`, la API rechaza cualquier host o puerto que no esté
  incluido en `SaeConnectionSecurity:AllowedHosts` y `AllowedPorts`.
- No publiques la API directamente en Internet. Colócala detrás del mecanismo
  de autenticación corporativo y limita el acceso de red al servidor Firebird.

Ejemplo de configuración de producción mediante variables de entorno:

```text
SaeConnectionSecurity__AllowedHosts__0=servidor-sae.interno
SaeConnectionSecurity__AllowedPorts__0=3050
Cors__AllowedOrigins__0=https://opervia.empresa.example
```

No agregues contraseñas de Firebird a `appsettings*.json` ni a variables del
frontend.

## MySQL local

En desarrollo Opervia usa el contenedor Docker `opervia-mysql`, publicado
solamente en `127.0.0.1:3307`, con el volumen persistente
`opervia_mysql_data`. La cadena de conexión está en .NET User Secrets y no
forma parte del repositorio.

```powershell
docker start opervia-mysql
docker stop opervia-mysql
```

La tabla `sae_connection_profiles` se crea automáticamente. Guardar un perfil
no abre ni modifica Firebird; únicamente conserva la configuración de Opervia.

## Requisitos

- .NET SDK 10
- Node.js 22.12 o posterior
- Ollama para Windows con el modelo `qwen3:4b`

## Inteligencia artificial local

Opervia utiliza Ollama en `http://127.0.0.1:11434` como proveedor principal.
Las preguntas y la evidencia SAE permanecen en el equipo y no generan cargos
por consulta.

```powershell
ollama pull qwen3:4b
ollama list
```

La configuración está en la sección `Ollama` de `appsettings.json`. La clave
de OpenAI puede conservarse como respaldo manual, pero Opervia no la usa
automáticamente y por tanto no genera consumo accidental.

Los modelos se almacenan en `D:\OllamaModels` para conservar espacio en la
unidad del sistema. Si el servicio local no está activo, puede iniciarse con:

```powershell
scripts\start-ollama-local.cmd
```

## Validación local sin Firebird

```powershell
dotnet restore Opervia.slnx
dotnet build Opervia.slnx --no-restore
dotnet test Opervia.slnx --no-restore

Set-Location src/Opervia.Web
npm ci
npm run lint
npm run build
```

Estas validaciones no requieren una base Firebird. Las consultas reales solo
se ejecutan al invocar explícitamente un endpoint SAE con una conexión válida.

## Ejecutar en otra PC (Windows)

1. Instala Git, el SDK de .NET 10 y Node.js 22.12 o posterior con npm.
2. Clona el proyecto y entra en su carpeta:

   ```powershell
   git clone https://github.com/Rezbel/Opervia.git
   Set-Location Opervia
   ```

3. Antes del primer arranque, configura la contraseña del administrador en esa
   misma ventana (sustituye el ejemplo por una contraseña propia):

   ```powershell
   $env:Auth__BootstrapPassword = '<contraseña inicial>'
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
   Remove-Item Env:Auth__BootstrapPassword
   ```

4. Abre http://localhost:5173/ e inicia sesión con `sistemas@qrq.com.mx` y la
   contraseña definida. Configura la conexión Firebird desde la aplicación.
   El equipo debe tener acceso al servidor SAE y a su puerto Firebird.
5. Para los siguientes arranques usa `Iniciar Opervia.cmd`. Para acceso desde
   otros equipos de la red usa `Iniciar Opervia en red.cmd`.

El iniciador restaura/compila la API e instala las dependencias web con `npm ci`
cuando faltan. No hace falta copiar `node_modules`, `bin` ni `obj`.

Git contiene el código, las pruebas y los scripts. La base SAE, las credenciales,
los archivos de `App_Data`, .NET User Secrets y las claves Data Protection se
transfieren por separado si necesitas conservar la instalación anterior.
Una clonación nueva crea una instalación sin los usuarios/perfiles previos.
MySQL es opcional en Development; sin cadena configurada se usa almacenamiento
local. Para Chat IA instala Ollama y descarga el modelo con `ollama pull qwen3:4b`.
