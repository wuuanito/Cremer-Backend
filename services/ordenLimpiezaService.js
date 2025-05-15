const { OrdenLimpieza } = require('../models');
const { Op } = require('sequelize');

class OrdenLimpiezaService {
  
  // Verificar si hay una orden de limpieza activa
  async verificarOrdenActiva() {
    return await OrdenLimpieza.findOne({
      where: { estado: 'iniciada' }
    });
  }
  
  // Obtener resumen de limpieza
  async obtenerResumenLimpieza(fechaInicio, fechaFin) {
    const ordenes = await OrdenLimpieza.findAll({
      where: {
        horaCreacion: {
          [Op.between]: [fechaInicio, fechaFin]
        },
        estado: 'finalizada'
      }
    });
    
    let tiempoTotalLimpieza = 0;
    
    for (const orden of ordenes) {
      tiempoTotalLimpieza += orden.duracion || 0;
    }
    
    return {
      totalOrdenes: ordenes.length,
      tiempoTotalLimpieza,
      tiempoPromedioLimpieza: ordenes.length > 0 ? tiempoTotalLimpieza / ordenes.length : 0
    };
  }
  
  // Obtener historial de limpiezas recientes
  async obtenerLimpiezasRecientes(dias = 7) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    return await OrdenLimpieza.findAll({
      where: {
        horaCreacion: {
          [Op.gte]: fechaLimite
        }
      },
      order: [['horaCreacion', 'DESC']]
    });
  }
}

module.exports = new OrdenLimpiezaService();