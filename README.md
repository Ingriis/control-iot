# Aplicación de Control IoT

Interfaz web responsive para el panel de control de un vehículo IoT tipo montacargas.

## Aplicación publicada

[Abrir Control IoT en GitHub Pages](https://ingriis.github.io/control-iot/)

## Alcance de esta entrega

Esta entrega publica **el frontend** en GitHub Pages. La aplicación web consume un backend existente mediante API REST y WebSocket seguro (WSS).

- El backend, la base de datos y el firmware del vehículo se administran por separado; no están incluidos en este repositorio.
- Esta etapa no migra el despliegue a Vercel ni implementa cambios en el microcontrolador.
- La interfaz puede mostrar estados de conexión y enviar solicitudes al backend; eso por sí solo no confirma que el vehículo haya ejecutado físicamente una acción.

## Funciones de la interfaz

- Diseño adaptable a móvil, tablet y computadora.
- Joystick virtual para movimientos direccionales y control vertical de horquillas.
- Botón de detener con prioridad sobre otros comandos.
- Controles de luces y sonido, cuando esos comandos están habilitados en el backend.
- Consulta de comandos y secuencias DEMO disponibles; envío de solicitudes para ejecutar una DEMO.
- Estado de la API, la base de datos y el WebSocket, además del resultado de solicitudes y eventos recibidos.
- Ajustes de conexión para la URL de la API, la URL del WebSocket y el identificador del vehículo.

Los controles que aparecen habilitados dependen de los comandos activos que reporte el backend.

## Tecnologías

- HTML5 y CSS3.
- JavaScript ES Modules, Fetch API y WebSocket del navegador.
- Bootstrap 5 para componentes y diseño adaptable.
- GitHub Pages para alojar los archivos estáticos del frontend.
- Un servidor HTTP sencillo en Python para previsualizar el frontend localmente.

## Estructura del proyecto

```text
.
├── assets/       Imágenes, iconos y sprites
├── js/
│   ├── api.js    Solicitudes REST al backend
│   ├── app.js    Inicio, controles y estado de la interfaz
│   ├── config.js Validación y almacenamiento local de ajustes
│   ├── joystick.js
│   └── websocket.js
├── index.html    Estructura de la página
├── styles.css    Estilos y adaptación a pantallas
└── server.py     Servidor local de previsualización
```

## Ejecutar localmente

Con Python instalado, abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
py server.py
```

Después abre <http://127.0.0.1:5502>. Para probar las funciones conectadas, configura en el engrane una API de desarrollo accesible y su URL WSS correspondiente.

## Configurar la conexión

Abre el engrane de ajustes e introduce:

1. La URL base HTTPS de la API.
2. La URL WSS del navegador, incluida la ruta WebSocket del vehículo.
3. El identificador del vehículo que existe en el backend.

Los ajustes se guardan en el almacenamiento local del navegador. Los valores iniciales apuntan a loopback (`127.0.0.1`) para evitar publicar la dirección privada del servidor. No agregues direcciones privadas, API keys ni otras credenciales a este repositorio.

Para conectar desde GitHub Pages, el backend debe estar disponible por HTTPS/WSS y autorizar el origen `https://ingriis.github.io`. La API REST y el handshake WebSocket deben aceptar ese origen.

## Integración utilizada

El frontend consulta estas operaciones REST, usando el identificador configurado:

- `GET /vehicles/{vehicle_id}/commands` — catálogo de comandos.
- `GET /vehicles/{vehicle_id}/demos` — secuencias DEMO disponibles.
- `GET /health/database` — estado de la base de datos.
- `POST /vehicles/{vehicle_id}/movements` — registrar y enviar un comando de movimiento.
- `POST /vehicles/{vehicle_id}/demos/{demo_id}/run` — solicitar la ejecución de una DEMO.
- `WS /ws/vehicles/{vehicle_id}` — estado inicial y eventos en tiempo real. En producción debe usarse WSS.

La respuesta HTTP indica que el backend aceptó una solicitud; no demuestra por sí sola que el vehículo haya realizado el movimiento.

## Publicación en GitHub Pages

El repositorio contiene el frontend en su raíz. En GitHub, configura Pages para desplegar desde la rama `main` y la carpeta `/(root)`. Los cambios enviados con `git push` activan una nueva publicación automáticamente.

La URL publicada es <https://ingriis.github.io/control-iot/>. El despliegue en Vercel queda fuera del alcance de esta entrega.
