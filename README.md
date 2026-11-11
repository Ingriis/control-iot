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
- Conexión preconfigurada con la API, el WebSocket y el identificador del vehículo.

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
│   ├── config.js Configuración predefinida y validación de URLs
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

Después abre <http://127.0.0.1:5502>. La configuración actual apunta al backend predefinido del proyecto; no uses la vista local para enviar comandos si no quieres conectarte a ese backend.

## Configuración de conexión y seguridad

La URL HTTPS de la API, la URL WSS y el identificador del vehículo están preconfigurados en `js/config.js`; no hay que ingresarlos desde la página. Para apuntar a otro entorno, cambia esos valores en el archivo y vuelve a publicar.

Como GitHub Pages entrega JavaScript al navegador, las direcciones del backend son visibles en el repositorio y en las solicitudes de red. No guardes API keys, contraseñas ni otros secretos en este frontend. El backend debe estar disponible por HTTPS/WSS y autorizar el origen `https://ingriis.github.io` para REST y WebSocket.

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
