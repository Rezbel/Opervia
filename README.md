# Opervia

## Arranque en Windows

Haz doble clic en `Iniciar Opervia.cmd`. El iniciador compila la API, inicia
los servicios y abre http://localhost:5173/. Los registros quedan en `.run/`.
También puedes ejecutar `scripts/start-local.ps1` desde PowerShell.

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
