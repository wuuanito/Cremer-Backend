# Sistema de Gestión de Órdenes de Fabricación y Limpieza

Este sistema permite gestionar órdenes de fabricación y limpieza en tiempo real, controlando el flujo de trabajo y registrando tiempos de actividad, pausas y producción.

## Características

- Gestión de órdenes de fabricación con seguimiento detallado
- Control de pausas con registro de tipos y comentarios
- Gestión simultánea de órdenes de limpieza
- Actualizaciones en tiempo real mediante WebSockets
- API RESTful escalable
- Validaciones para garantizar que no haya múltiples órdenes de fabricación activas
- Cálculo automático de tiempos de actividad y estadísticas

## Requisitos previos

- Node.js (v14 o superior)
- MySQL (v5.7 o superior)
- npm (incluido con Node.js)

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/tu-usuario/sistema-ordenes.git
cd sistema-ordenes
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
   - Crear un archivo `.env` en la raíz del proyecto con el siguiente contenido:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=tu_contraseña
   DB_NAME=sistema_ordenes
   PORT=3000
   NODE_ENV=development
   ```

4. Inicializar la base de datos:
```bash
# Crear el directorio scripts si no existe
mkdir -p scripts

# Copiar el script de inicialización a ese directorio
# (Asegúrate de que el archivo initDatabase.js esté en scripts/)

# Ejecutar el script de inicialización
node scripts/initDatabase.js
```

5. Iniciar el servidor:
```bash
# Modo desarrollo con recarga automática
npm run dev

# Modo producción
npm start
```

## Estructura del proyecto

```
/proyecto-ordenes/
├── package.json           # Configuración del proyecto y dependencias
├── .env                   # Variables de entorno (no incluir en control de versiones)
├── app.js                 # Punto de entrada principal
├── config/                # Configuraciones
│   └── database.js        # Configuración de conexión a la base de datos
├── models/                # Modelos de la base de datos
│   ├── index.js           # Exportación de modelos
│   ├── ordenFabricacion.js
│   ├── pausa.js
│   └── ordenLimpieza.js
├── controllers/           # Controladores para manejar las peticiones
│   ├── ordenFabricacionController.js
│   ├── pausaController.js
│   └── ordenLimpiezaController.js
├── routes/                # Definición de rutas de la API
│   ├── ordenFabricacionRoutes.js
│   ├── pausaRoutes.js
│   └── ordenLimpiezaRoutes.js
├── services/              # Lógica de negocio
│   ├── ordenFabricacionService.js
│   └── ordenLimpiezaService.js
├── middlewares/           # Funciones middleware
│   └── validacionMiddleware.js
├── utils/                 # Utilidades y funciones auxiliares
│   └── helpers.js
└── scripts/               # Scripts de utilidad
    └── initDatabase.js    # Script para crear la base de datos
```

## Endpoints de la API

### Órdenes de Fabricación

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/ordenes-fabricacion | Obtener todas las órdenes |
| GET | /api/ordenes-fabricacion/:id | Obtener una orden por ID |
| POST | /api/ordenes-fabricacion | Crear nueva orden |
| PUT | /api/ordenes-fabricacion/:id | Actualizar orden |
| DELETE | /api/ordenes-fabricacion/:id | Eliminar orden (solo en estado 'creada') |
| POST | /api/ordenes-fabricacion/:id/iniciar | Iniciar orden |
| POST | /api/ordenes-fabricacion/:id/pausar | Pausar orden |
| POST | /api/ordenes-fabricacion/:id/finalizar | Finalizar orden |

### Pausas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/pausas | Obtener todas las pausas |
| GET | /api/pausas/:id | Obtener pausa por ID |
| GET | /api/pausas/orden/:ordenFabricacionId | Obtener pausas de una orden |
| PUT | /api/pausas/:id | Actualizar pausa (comentario) |
| POST | /api/pausas/:id/finalizar | Finalizar pausa |

### Órdenes de Limpieza

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/ordenes-limpieza | Obtener todas las órdenes |
| GET | /api/ordenes-limpieza/:id | Obtener orden por ID |
| POST | /api/ordenes-limpieza | Crear nueva orden |
| PUT | /api/ordenes-limpieza/:id | Actualizar orden |
| DELETE | /api/ordenes-limpieza/:id | Eliminar orden (solo en estado 'creada') |
| POST | /api/ordenes-limpieza/:id/iniciar | Iniciar orden |
| POST | /api/ordenes-limpieza/:id/finalizar | Finalizar orden |

## Ejemplos de uso de la API

### Crear una orden de fabricación

```bash
curl -X POST http://localhost:3000/api/ordenes-fabricacion \
  -H "Content-Type: application/json" \
  -d '{
    "codigoOrden": "OF-001",
    "codigoArticulo": "ART-123",
    "descripcion": "Producción de botes de conserva",
    "cantidad": 1000,
    "botesPorCaja": 24,
    "llevaNumeroCorteSanitario": true,
    "numeroCorteSanitarioInicial": "CS-000123"
  }'
```

### Iniciar una orden de fabricación

```bash
curl -X POST http://localhost:3000/api/ordenes-fabricacion/1/iniciar
```

### Pausar una orden de fabricación

```bash
curl -X POST http://localhost:3000/api/ordenes-fabricacion/1/pausar \
  -H "Content-Type: application/json" \
  -d '{
    "tipoPausa": "Mantenimiento",
    "comentario": "Ajuste de maquinaria"
  }'
```

### Finalizar una orden de fabricación

```bash
curl -X POST http://localhost:3000/api/ordenes-fabricacion/1/finalizar \
  -H "Content-Type: application/json" \
  -d '{
    "botesBuenos": 950,
    "botesExpulsados": 50,
    "cajasContadas": 40,
    "numeroCorteSanitarioFinal": "CS-000150"
  }'
```

## Comunicación en tiempo real

El sistema utiliza Socket.IO para proporcionar actualizaciones en tiempo real. Los clientes pueden conectarse y recibir notificaciones automáticas cuando se producen cambios en las órdenes.

### Eventos disponibles

- `ordenFabricacion:created`: Nueva orden de fabricación creada
- `ordenFabricacion:updated`: Orden de fabricación actualizada (inicio, pausa, fin, etc.)
- `ordenFabricacion:deleted`: Orden de fabricación eliminada
- `ordenLimpieza:created`: Nueva orden de limpieza creada
- `ordenLimpieza:updated`: Orden de limpieza actualizada
- `ordenLimpieza:deleted`: Orden de limpieza eliminada

### Ejemplo de cliente JavaScript

```javascript
const socket = io('http://localhost:3000');

// Escuchar actualizaciones de órdenes de fabricación
socket.on('ordenFabricacion:updated', (orden) => {
  console.log('Orden actualizada:', orden);
  // Actualizar interfaz de usuario
});

// Escuchar nuevas órdenes
socket.on('ordenFabricacion:created', (orden) => {
  console.log('Nueva orden creada:', orden);
  // Actualizar interfaz de usuario
});
```

## Reglas de negocio importantes

1. No puede haber dos órdenes de fabricación iniciadas simultáneamente.
2. Una orden de limpieza puede estar activa al mismo tiempo que una orden de fabricación.
3. Las órdenes solo pueden ser eliminadas si están en estado "creada".
4. Una orden de fabricación puede ser pausada múltiples veces, registrando cada pausa.
5. Al finalizar una orden, se calculan automáticamente los tiempos de actividad y pausa.

## Solución de problemas

### Error de conexión a la base de datos

- Verifica que MySQL esté ejecutándose
- Comprueba que las credenciales en el archivo `.env` sean correctas
- Asegúrate de que la base de datos exista (ejecuta `node scripts/initDatabase.js`)

### El servidor no inicia

- Comprueba que el puerto especificado (por defecto 3000) no esté en uso
- Verifica los logs de error para identificar el problema específico

## Desarrollo y contribución

1. Crea una rama para tu funcionalidad: `git checkout -b feature/nueva-funcionalidad`
2. Realiza tus cambios y haz commits: `git commit -m 'Agregar nueva funcionalidad'`
3. Envía tus cambios: `git push origin feature/nueva-funcionalidad`
4. Abre un Pull Request para revisión

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo LICENSE para más detalles.