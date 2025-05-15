const { OrdenFabricacion, Pausa } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

class OrdenFabricacionService {
  
  // Verificar si hay una orden de fabricación activa
  async verificarOrdenActiva() {
    return await OrdenFabricacion.findOne({
      where: { estado: 'iniciada' }
    });
  }
  
  // Calcular estadísticas de una orden
  async calcularEstadisticas(ordenId) {
    const orden = await OrdenFabricacion.findByPk(ordenId, {
      include: ['pausas']
    });
    
    if (!orden) {
      throw new Error('Orden no encontrada');
    }
    
    // Si la orden no tiene hora de inicio, no hay estadísticas que calcular
    if (!orden.horaInicio) {
      return {
        tiempoTotal: 0,
        tiempoActivo: 0,
        tiempoPausado: 0,
        pausas: []
      };
    }
    
    // Si la orden está finalizada, usamos la hora de fin
    // Si no, usamos la hora actual para calcular tiempos parciales
    const horaFin = orden.horaFin || new Date();
    const tiempoTotal = Math.floor((horaFin - orden.horaInicio) / 1000); // en segundos
    
    // Procesar todas las pausas
    const pausas = [];
    let tiempoPausado = 0;
    
    for (const pausa of orden.pausas) {
      const pausaFin = pausa.horaFin || new Date();
      const duracionPausa = Math.floor((pausaFin - pausa.horaInicio) / 1000);
      
      pausas.push({
        id: pausa.id,
        tipoParada: pausa.tipoPausa,
        inicio: pausa.horaInicio,
        fin: pausa.horaFin,
        duracion: duracionPausa,
        comentario: pausa.comentario
      });
      
      tiempoPausado += duracionPausa;
    }
    
    // Calcular tiempo activo
    const tiempoActivo = tiempoTotal - tiempoPausado;
    
    return {
      tiempoTotal,
      tiempoActivo,
      tiempoPausado,
      pausas
    };
  }
  
  // Obtener órdenes recientes (últimos días)
  async obtenerOrdenesRecientes(dias = 7) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    return await OrdenFabricacion.findAll({
      where: {
        horaCreacion: {
          [Op.gte]: fechaLimite
        }
      },
      include: ['pausas'],
      order: [['horaCreacion', 'DESC']]
    });
  }
  
  // Obtener resumen de producción
  async obtenerResumenProduccion(fechaInicio, fechaFin) {
    const ordenes = await OrdenFabricacion.findAll({
      where: {
        horaCreacion: {
          [Op.between]: [fechaInicio, fechaFin]
        },
        estado: 'finalizada'
      },
      include: ['pausas']
    });
    
    let totalBotesBuenos = 0;
    let totalBotesExpulsados = 0;
    let totalCajas = 0;
    let tiempoTotalActivo = 0;
    let tiempoTotalPausado = 0;
    
    for (const orden of ordenes) {
      totalBotesBuenos += orden.botesBuenos;
      totalBotesExpulsados += orden.botesExpulsados;
      totalCajas += orden.cajasContadas;
      tiempoTotalActivo += orden.tiempoActivo;
      tiempoTotalPausado += orden.tiempoPausado;
    }
    
    return {
      totalOrdenes: ordenes.length,
      totalBotesBuenos,
      totalBotesExpulsados,
      totalCajas,
      tiempoTotalActivo,
      tiempoTotalPausado,
      eficiencia: tiempoTotalActivo > 0 ? (tiempoTotalActivo / (tiempoTotalActivo + tiempoTotalPausado)) * 100 : 0
    };
  }
  
  // Obtener tipos de pausas más frecuentes
  async obtenerTiposPausasFrecuentes() {
    const pausas = await Pausa.findAll();
    
    const tipoPausaCount = {};
    
    for (const pausa of pausas) {
      if (!tipoPausaCount[pausa.tipoPausa]) {
        tipoPausaCount[pausa.tipoPausa] = 0;
      }
      
      tipoPausaCount[pausa.tipoPausa]++;
    }
    
    // Convertir a array y ordenar
    const tiposPausaArray = Object.entries(tipoPausaCount).map(([tipo, cantidad]) => ({
      tipo,
      cantidad
    }));
    
    tiposPausaArray.sort((a, b) => b.cantidad - a.cantidad);
    
    return tiposPausaArray;
  }
}

module.exports = new OrdenFabricacionService();