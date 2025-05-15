// Middleware para validar que la petición tenga los campos requeridos
exports.validateFields = (requiredFields) => {
    return (req, res, next) => {
      const missingFields = [];
      
      for (const field of requiredFields) {
        if (!req.body[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          message: 'Campos requeridos faltantes',
          missingFields
        });
      }
      
      next();
    };
  };
  
  // Middleware para validar que no haya órdenes de fabricación activas
  exports.validateNoActiveOrdenFabricacion = async (req, res, next) => {
    try {
      const { OrdenFabricacion } = require('../models');
      
      const activeOrden = await OrdenFabricacion.findOne({
        where: { estado: 'iniciada' }
      });
      
      if (activeOrden) {
        return res.status(400).json({
          message: 'Ya hay una orden de fabricación activa',
          ordenActiva: activeOrden.id
        });
      }
      
      next();
    } catch (error) {
      console.error('Error en middleware de validación:', error);
      return res.status(500).json({
        message: 'Error al validar órdenes activas',
        error: error.message
      });
    }
  };
  
  // Middleware para logging de peticiones
  exports.requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    
    next();
  };
  
  // Middleware para manejar errores
  exports.errorHandler = (err, req, res, next) => {
    console.error('Error no controlado:', err);
    
    res.status(500).json({
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error del servidor'
    });
  };