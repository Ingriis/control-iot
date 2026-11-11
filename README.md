# Manual de usuario · Control IoT

## 1. Abrir la aplicación

La aplicación de control está publicada en GitHub Pages:

**[Abrir Control IoT](https://ingriis.github.io/control-iot/)**

Se puede abrir desde una computadora, tableta o teléfono con un navegador actualizado. Para que la interfaz obtenga comandos, estados y eventos, también debe estar disponible el servidor API del proyecto.

> La página web se aloja en GitHub Pages. La API, la base de datos y el vehículo funcionan por separado. Abrir la página no enciende ni conecta físicamente el vehículo.

## 2. Conocer la pantalla

En la parte superior aparecen tres indicadores:

- **WebSocket WSS · navegador:** indica si esta página mantiene su conexión en tiempo real con la API.
- **Servidor AWS · API:** indica si la API responde a las consultas de la aplicación.
- **Amazon RDS:** indica si la API reporta disponible su conexión con la base de datos.

Los indicadores muestran el resultado de una comprobación de red. Por sí solos no confirman que el vehículo esté encendido o que haya ejecutado un movimiento.

La sección **Control** contiene los mandos. La sección **Monitoreo** muestra el último estado reportado y el historial que devuelve la API.

## 3. Manejar los controles

1. Abre la página y espera a que carguen el catálogo de comandos y las secuencias DEMO.
2. Comprueba que los indicadores de API y base de datos estén disponibles. Para recibir actualizaciones en tiempo real, el WebSocket también debe estar conectado.
3. Usa el joystick en pantalla con el mouse o el dedo. También puedes enfocarlo y usar las flechas del teclado.
4. Usa el joystick de las horquillas para los movimientos verticales que muestre la interfaz.
5. Pulsa **Luces** o **Sonido** para solicitar el cambio correspondiente. Estos botones dependen de que el backend reporte esos comandos como activos.
6. Para una secuencia, elige una DEMO y pulsa ejecutar. La interfaz mostrará el resultado de la solicitud y los eventos recibidos.
7. Pulsa **Detener** para enviar el comando de parada disponible en el catálogo. La API da prioridad a detener frente a otros comandos según su configuración.

La interfaz envía solicitudes al backend. Un mensaje de solicitud aceptada significa que el servidor recibió la petición; la confirmación del movimiento físico depende del estado y los eventos que reporte el vehículo.

## 4. Leer el monitoreo y los mensajes

- **Última acción** resume la solicitud REST más reciente y el evento WebSocket recibido.
- **Estado del vehículo** refleja el último estado reportado por el backend.
- **Historial** muestra hasta diez movimientos individuales consultados a la API.
- Si el navegador pierde el WebSocket, el estado conocido puede permanecer visible mientras se intenta reconectar.
- Si aparece un mensaje sobre API o CORS, revisa la conexión y la configuración del servidor descrita abajo.

## 5. Requisitos de conexión

La aplicación web está configurada para consultar una API HTTPS y conectarse por WSS al vehículo con identificador `1`. Las direcciones están definidas en `js/config.js` y son visibles para cualquier visitante porque el frontend es público. No se deben guardar contraseñas, API keys ni otros secretos en este repositorio.

El servidor backend debe:

- estar encendido y ser accesible desde Internet;
- tener certificados válidos para HTTPS y WSS;
- permitir el origen `https://ingriis.github.io` en CORS para REST;
- permitir ese mismo origen durante el inicio del WebSocket;
- tener la base de datos y el vehículo configurados para el identificador usado por la aplicación.

Cambiar CORS en el backend no modifica las imágenes, el frontend ni el servidor por sí solo: después de guardar el cambio hay que reiniciar la API.

## 6. Si algo no funciona

| Lo que aparece | Qué revisar |
|---|---|
| API no disponible | Que la API esté iniciada y que su dirección HTTPS responda. |
| Error de conexión o CORS | Que el backend permita `https://ingriis.github.io` y los métodos y encabezados que utiliza la API. |
| WebSocket reconectando | Que el backend acepte WSS y el origen de GitHub Pages; revisa también que la ruta `/ws/vehicles/1` corresponda al vehículo configurado. |
| Amazon RDS no disponible | La conexión a la base de datos y el indicador de salud del backend. |
| No aparecen comandos o DEMO | Que la API responda y tenga comandos y secuencias activos para ese vehículo. |
| La solicitud se acepta pero el montacargas no se mueve | Revisar el estado del vehículo, su conexión con el backend, la alimentación y el firmware. La aceptación HTTP no prueba el movimiento físico. |
| Las imágenes no se actualizan | Recargar la página sin caché o esperar a que termine la publicación de GitHub Pages. |

## 7. Abrir una copia local

Para previsualizar los archivos en una computadora con Python:

1. Abre PowerShell en la carpeta `frontend`.
2. Ejecuta:

   ```powershell
   py server.py
   ```

3. Abre <http://127.0.0.1:5502> en el navegador.

La copia local usa la misma configuración predefinida de API y vehículo que la versión publicada; si se envían comandos, estos se dirigen a ese backend.

## 8. Actualizar la aplicación publicada

El repositorio contiene únicamente el frontend. GitHub Pages publica desde la rama `main` y la carpeta raíz del repositorio. Al subir cambios a `main`, GitHub inicia una nueva publicación automáticamente.

En PowerShell, desde la carpeta `frontend`, los pasos habituales son:

```powershell
git status
git add .
git commit -m "Describe el cambio"
git push origin main
```

Cuando el proceso de Pages termine, abre [la aplicación publicada](https://ingriis.github.io/control-iot/) y recarga la página. Backend, base de datos y firmware se despliegan y mantienen por separado. El alojamiento de esta entrega usa GitHub Pages; no Vercel.

## 9. Referencia para desarrollo

- `index.html`: contenido y estructura de la página.
- `styles.css`: presentación y adaptación a distintos tamaños de pantalla.
- `js/config.js`: dirección de API, WebSocket e identificador de vehículo.
- `js/api.js`: solicitudes HTTP al backend.
- `js/websocket.js`: conexión y reconexión en tiempo real.
- `js/app.js`: inicio de la interfaz, controles y coordinación de estados.
- `js/joystick.js`: interacción con los joysticks.
- `js/monitor.js`: presentación del estado e historial.
- `assets/`: imágenes, iconos y sprites utilizados por la interfaz.
