const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Configuración de la base de datos
const { sequelize, testConnection } = require('./config/database');

// Importar rutas
const ordenFabricacionRoutes = require('./routes/ordenFabricacionRoutes');
const pausaRoutes = require('./routes/pausaRoutes');
const ordenLimpiezaRoutes = require('./routes/ordenLimpiezaRoutes');
const reporteRoutes = require('./routes/reporteRoutes');

// Middlewares
const { requestLogger, errorHandler } = require('./middlewares/validacionMiddleware');

// Inicializar la aplicación Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Middleware de configuración
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// IMPORTANTE: Aumentar límite de payload para evitar errores
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
app.use(requestLogger);

// Compartir instancia de socket.io con los controladores
app.set('io', io);

// Middleware para agregar información de conexión de BD
app.use((req, res, next) => {
  req.dbStatus = sequelize.authenticate ? 'connected' : 'disconnected';
  next();
});

// Ruta de salud mejorada
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    await sequelize.authenticate();
    
    res.status(200).json({ 
      status: 'ok', 
      time: new Date(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      time: new Date(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// Ruta de bienvenida
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Sistema de Órdenes de Fabricación y Limpieza',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/api/ordenes-fabricacion', ordenFabricacionRoutes);
app.use('/api/pausas', pausaRoutes);
app.use('/api/ordenes-limpieza', ordenLimpiezaRoutes);
app.use('/api/reportes', reporteRoutes);

// Socket.io para tiempo real - CON MANEJO DE ERRORES
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id} desde ${socket.handshake.address}`);
  
  // Enviar estado inicial al cliente
  socket.emit('server:status', {
    status: 'connected',
    timestamp: new Date().toISOString()
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`Cliente desconectado: ${socket.id}, razón: ${reason}`);
  });
  
  // Suscribirse a canales específicos
  socket.on('subscribe', (room) => {
    try {
      socket.join(room);
      console.log(`Cliente ${socket.id} se unió al canal: ${room}`);
      socket.emit('subscribed', { room, status: 'success' });
    } catch (error) {
      console.error(`Error al suscribir cliente ${socket.id} al canal ${room}:`, error);
      socket.emit('subscribed', { room, status: 'error', error: error.message });
    }
  });
  
  socket.on('unsubscribe', (room) => {
    try {
      socket.leave(room);
      console.log(`Cliente ${socket.id} dejó el canal: ${room}`);
      socket.emit('unsubscribed', { room, status: 'success' });
    } catch (error) {
      console.error(`Error al desuscribir cliente ${socket.id} del canal ${room}:`, error);
      socket.emit('unsubscribed', { room, status: 'error', error: error.message });
    }
  });
  
  // Manejo de errores de socket
  socket.on('error', (error) => {
    console.error(`Error en socket ${socket.id}:`, error);
  });
});

// Manejo de errores de Socket.IO
io.on('error', (error) => {
  console.error('Error en Socket.IO:', error);
});

// Ruta para manejar rutas no encontradas
app.use('*', (req, res) => {
  console.log(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Middleware mejorado para manejo de errores
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  
  // Error de timeout
  if (error.code === 'ETIMEDOUT') {
    return res.status(408).json({
      message: 'Timeout de la petición',
      error: 'La operación tardó demasiado tiempo'
    });
  }
  
  // Error de payload demasiado grande
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Payload demasiado grande',
      error: 'Los datos enviados exceden el límite permitido'
    });
  }
  
  // Error de JSON malformado
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      message: 'JSON malformado',
      error: 'Los datos enviados no tienen un formato JSON válido'
    });
  }
  
  // Error general
  res.status(error.status || 500).json({
    message: error.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? error.stack : 'Error interno',
    timestamp: new Date().toISOString()
  });
});

// Usar el errorHandler personalizado si existe
app.use(errorHandler);

// Puerto para el servidor
const PORT = process.env.PORT || 3001;

// Función mejorada para iniciar el servidor
const iniciarServidor = async () => {
  try {
    console.log('=== INICIANDO SERVIDOR ===');
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Puerto: ${PORT}`);
    
    // Probar conexión a la base de datos con retry
    let intentos = 0;
    const maxIntentos = 5;
    let conexionExitosa = false;
    
    while (intentos < maxIntentos && !conexionExitosa) {
      try {
        console.log(`Intento de conexión a BD: ${intentos + 1}/${maxIntentos}`);
        conexionExitosa = await testConnection();
        
        if (!conexionExitosa) {
          intentos++;
          if (intentos < maxIntentos) {
            console.log('Esperando 5 segundos antes del siguiente intento...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      } catch (error) {
        console.error(`Error en intento ${intentos + 1}:`, error.message);
        intentos++;
        if (intentos < maxIntentos) {
          console.log('Esperando 5 segundos antes del siguiente intento...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    if (!conexionExitosa) {
      console.error('No se pudo establecer conexión con la base de datos después de todos los intentos.');
      console.error('Cerrando aplicación.');
      process.exit(1);
    }
    
    console.log('✅ Conexión a base de datos establecida');
    
    // Sincronizar modelos con la base de datos
    try {
      const syncOptions = {
        alter: process.env.NODE_ENV === 'development',
        force: false // NUNCA usar force: true en producción
      };
      
      await sequelize.sync(syncOptions);
      console.log('✅ Modelos sincronizados con la base de datos');
    } catch (syncError) {
      console.error('❌ Error al sincronizar modelos:', syncError);
      throw syncError;
    }
    
    // Iniciar servidor HTTP
    const httpServer = server.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Servidor HTTP iniciado');
      console.log(`🚀 Servidor ejecutándose en http://0.0.0.0:${PORT}`);
      console.log(`📡 Socket.IO habilitado`);
      console.log('=== SERVIDOR LISTO ===');
    });
    
    // Configurar timeouts
    httpServer.timeout = 120000; // 2 minutos
    httpServer.keepAliveTimeout = 65000; // 65 segundos
    httpServer.headersTimeout = 66000; // 66 segundos
    
    // Manejo graceful de cierre del servidor
    process.on('SIGTERM', () => {
      console.log('SIGTERM recibido, cerrando servidor gracefully...');
      httpServer.close(() => {
        console.log('Servidor HTTP cerrado');
        sequelize.close().then(() => {
          console.log('Conexión de BD cerrada');
          process.exit(0);
        });
      });
    });
    
    process.on('SIGINT', () => {
      console.log('SIGINT recibido, cerrando servidor gracefully...');
      httpServer.close(() => {
        console.log('Servidor HTTP cerrado');
        sequelize.close().then(() => {
          console.log('Conexión de BD cerrada');
          process.exit(0);
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Error crítico al iniciar el servidor:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  console.error('Promesa:', promise);
  process.exit(1);
});

// Iniciar servidor
iniciarServidor();

module.exports = { app, server, io };