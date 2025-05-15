const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const dotenv = require('dotenv');
const reporteRoutes = require('./routes/reporteRoutes');

// Cargar variables de entorno
dotenv.config();

// Configuración de la base de datos
const { sequelize, testConnection } = require('./config/database');

// Importar rutas CORRECTAMENTE
const ordenFabricacionRoutes = require('./routes/ordenFabricacionRoutes');
const pausaRoutes = require('./routes/pausaRoutes');
const ordenLimpiezaRoutes = require('./routes/ordenLimpiezaRoutes');

// Middlewares
const { requestLogger, errorHandler } = require('./middlewares/validacionMiddleware');

// Inicializar la aplicación Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});
// En tu archivo principal del servidor (app.js o index.js)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use('/api/reportes', reporteRoutes);

// Compartir instancia de socket.io con los controladores
app.set('io', io);

// Ruta de salud para verificar que el servidor está funcionando
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date() });
});

// Ruta de bienvenida
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Sistema de Órdenes de Fabricación y Limpieza',
    version: '1.0.0',
    documentation: '/api-docs'
  });
});

// Rutas de la API - FORMA CORRECTA DE USAR app.use
app.use('/api/ordenes-fabricacion', ordenFabricacionRoutes);
app.use('/api/pausas', pausaRoutes);
app.use('/api/ordenes-limpieza', ordenLimpiezaRoutes);

// Ruta para manejar rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Middleware para manejo de errores
app.use(errorHandler);

// Socket.io para tiempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado: ' + socket.id);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado: ' + socket.id);
  });
  
  // Suscribirse a canales específicos
  socket.on('subscribe', (room) => {
    socket.join(room);
    console.log(`Cliente ${socket.id} se unió al canal: ${room}`);
  });
  
  socket.on('unsubscribe', (room) => {
    socket.leave(room);
    console.log(`Cliente ${socket.id} dejó el canal: ${room}`);
  });
});

// Puerto para el servidor
const PORT = process.env.PORT || 3001;

// Función para iniciar el servidor
const iniciarServidor = async () => {
  try {
    // Probar conexión a la base de datos
    const conexionExitosa = await testConnection();
    
    if (!conexionExitosa) {
      console.error('No se pudo establecer conexión con la base de datos. Cerrando aplicación.');
      process.exit(1);
    }
    
    // Sincronizar modelos con la base de datos
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('Modelos sincronizados con la base de datos.');
    
    // Iniciar servidor HTTP
    server.listen(PORT, () => {
      console.log(`Servidor ejecutándose en el puerto ${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar servidor
iniciarServidor();

module.exports = { app, server, io };