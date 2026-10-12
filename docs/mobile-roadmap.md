# Opervia móvil: Android primero

Dirección del proyecto definida el 9 de octubre de 2026: mantener Opervia web y añadir una experiencia móvil, priorizando Android y conservando una vía para iPhone.

Este documento define el trabajo siguiente. Todavía no se ha generado una app Android, añadido Capacitor ni habilitado una PWA.

## Arquitectura

La web y los clientes móviles utilizan la misma API .NET, usuarios, permisos y lógica de consulta SAE. La API permanece en el servidor: durante el piloto, en los contenedores de Windows 11; después, en la VM Linux.

El teléfono consulta la API por HTTPS a través del dominio publicado. No se conecta directamente a Firebird ni recibe las credenciales de la base de datos.

El frontend React/Vite existente es la base compartida. Se adaptan sus pantallas para uso táctil y se añade Capacitor para generar el cliente Android. Capacitor admite proyectos web existentes y los destinos Android e iOS. [Documentación](https://capacitorjs.com/docs).

La dirección pública aún debe configurarse siguiendo el tutorial de contenedores. Publicar un DNS sin un servidor y túnel operativos no basta para que funcione el cliente móvil.

## Primera etapa: experiencia móvil y pruebas por web

Adaptar el sistema a teléfonos antes de empaquetarlo:

- Navegación cómoda con el pulgar, respetando los módulos autorizados para cada rol.
- Filtros, búsquedas y selecciones múltiples utilizables con teclado móvil y controles táctiles.
- Resúmenes con tarjetas que se ajusten a pantallas pequeñas.
- Listados de clientes y facturas con información principal visible y detalles desplegables.
- Tablas extensas con presentación móvil específica; mantener la vista de escritorio.
- Formularios de acceso, modales y detalles de partidas que no queden ocultos por el teclado.
- Manejo claro de conexión perdida, sesión vencida y consultas en curso.

Priorizar login, Centro de control, Clientes, Cobranza y Vencimientos. Revisar posteriormente los demás módulos, incluidos Flujos y las tablas de análisis complejas. Las prioridades de diseño no cambian los permisos ni eliminan módulos.

La base actual tiene viewport y reglas responsive, pero eso no acredita por sí solo una experiencia móvil completa. Falta probar el recorrido real en teléfonos.

Habilitar la instalación web como PWA para el piloto: manifest, iconos, modo standalone, pantalla inicial y actualización controlada de los recursos de interfaz. Las consultas de API y autenticación se mantienen fuera de la caché persistente del service worker.

Los usuarios de Android e iPhone pueden probar la web. En iPhone también puede añadirse al inicio y abrirse como aplicación web desde Safari. [Instrucciones de Apple](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).

La primera versión requiere Internet y disponibilidad del servidor para consultar SAE. El modo sin conexión con datos financieros guardados requiere un alcance adicional; instalar una PWA o APK no crea esa capacidad automáticamente.

## Segunda etapa: cliente Android con Capacitor

Añadir el proyecto Android y el flujo de compilación a partir del frontend compartido. El artefacto inicial será una compilación de prueba; definir el método de distribución y la firma antes de entregarla a usuarios. Android Studio forma parte del entorno de desarrollo. [Requisitos de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup).

Incluir y validar:

- Icono y arranque de Opervia.
- Botón Atrás de Android, rutas internas y retorno después de iniciar sesión.
- Áreas seguras, teclado, orientación y cambio entre aplicación activa y segundo plano.
- Enlaces externos abiertos mediante el mecanismo adecuado del sistema.
- URL de API HTTPS por entorno, separada del build web de API relativa.
- Actualizaciones con versión identificable, sin sustituir el artefacto aprobado por cambios web no validados.

La app debe empaquetar los recursos de interfaz. Cargar únicamente la web remota dentro de una ventana no sustituye la adaptación móvil ni las pruebas del cliente Android.

## Autenticación: requisito previo del APK

El cliente actual utiliza cookies HttpOnly, `credentials: include`, validación de origen y cookies `SameSite=Strict`. Funciona para el acceso web del mismo sitio.

Un cliente Capacitor empaquetado usa un origen distinto del sitio remoto. Cambiar solamente `VITE_API_URL` o permitir otro origen CORS no demuestra que las cookies funcionen: hay que resolver y probar el comportamiento de sesión en el WebView y en el transporte elegido.

Antes de distribuir el APK, diseñar y comprobar la autenticación móvil, manteniendo revocación de sesiones, permisos y restricciones de vendedores en la API. Si se utiliza un mecanismo de tokens para el cliente nativo, incluir expiración, renovación, revocación y almacenamiento protegido por la plataforma. No guardar tokens de larga duración o contraseñas SAE en localStorage.

La PWA del mismo sitio puede conservar el mecanismo web mientras se resuelve la integración nativa. No debilitar globalmente las cookies ni eliminar la protección de origen para hacer pasar una prueba del APK.

## Tercera etapa: iPhone

Mantener la PWA como vía de acceso durante las pruebas. Si se requiere una aplicación iOS distribuida, reutilizar la base con Capacitor y añadir las pruebas propias de iOS.

Para compilar localmente la app iOS se necesita macOS y Xcode; también existen servicios de compilación remota sobre macOS. [Entorno iOS](https://capacitorjs.com/docs/getting-started/environment-setup).

La distribución por App Store requiere el programa de desarrolladores y cumplir la revisión de Apple; la membresía estándar es de USD 99 por año o su equivalente local. Esto es distinto de añadir la web al inicio del iPhone. [Apple Developer Program](https://developer.apple.com/programs/enroll/).

## Criterios para aceptar el piloto móvil

1. Login, cierre de sesión, revocación y permisos correctos con usuarios de cada rol.
2. Montos de clientes, facturas y partidas equivalentes a los de la web para el mismo filtro.
3. Selecciones múltiples, paginación y búsquedas utilizables en pantallas pequeñas.
4. Recargar rutas y utilizar Atrás sin perder el contexto de navegación esperado.
5. Consultar desde datos móviles y recuperar la interfaz después de perder conexión.
6. Comprobar persistencia y protección de sesión tras cerrar y reabrir el cliente.
7. Validar que cambiar la instalación del servidor a la VM no requiere cambiar la dirección configurada del cliente.
8. Probar en dispositivos reales, incluyendo al menos Android; validar Safari de iPhone para la vía web.

Notificaciones, cámara, biometría y trabajo sin conexión se consideran ampliaciones posteriores, sujetas a necesidades concretas. No son necesarias para la primera versión de consultas.
