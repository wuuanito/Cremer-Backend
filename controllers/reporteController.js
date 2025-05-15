// controllers/reporteController.js (Part 1)
const { OrdenFabricacion, Pausa, OrdenLimpieza } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

// Controlador para reportes
const reporteController = {

  // Obtener reporte completo de una orden de fabricación
  getReporteOrdenFabricacion: async (req, res) => {
    try {
      const { id } = req.params;
      
      const orden = await OrdenFabricacion.findByPk(id, {
        include: [{
          model: Pausa,
          as: 'pausas',
          required: false
        }]
      });
      
      if (!orden) {
        return res.status(404).json({ 
          message: 'Orden de fabricación no encontrada' 
        });
      }
      
      // Calcular métricas adicionales
      let tiempoTotal = 0;
      if (orden.horaInicio) {
        const horaFin = orden.horaFin || new Date();
        tiempoTotal = Math.floor((horaFin - orden.horaInicio) / 1000);
      }
      
      // Calcular eficiencia (tiempo activo vs. tiempo total)
      const eficiencia = tiempoTotal > 0 ? ((tiempoTotal - orden.tiempoPausado) / tiempoTotal) * 100 : 0;
      
      // Calcular diferencia entre botes registrados por operario y conteo automático
      const diferenciaBotes = orden.botesOperario - orden.botesBuenos;
      const porcentajeDiferencia = orden.botesBuenos > 0 ? (diferenciaBotes / orden.botesBuenos) * 100 : 0;
      
      // Agrupar pausas por tipo
      const pausasPorTipo = {};
      let tiempoPausaTotal = 0;
      
      orden.pausas.forEach(pausa => {
        if (!pausasPorTipo[pausa.tipoPausa]) {
          pausasPorTipo[pausa.tipoPausa] = {
            cantidad: 0,
            tiempoTotal: 0,
            detalle: []
          };
        }
        
        const duracion = pausa.duracion || 0;
        tiempoPausaTotal += duracion;
        
        pausasPorTipo[pausa.tipoPausa].cantidad++;
        pausasPorTipo[pausa.tipoPausa].tiempoTotal += duracion;
        pausasPorTipo[pausa.tipoPausa].detalle.push({
          id: pausa.id,
          inicio: pausa.horaInicio,
          fin: pausa.horaFin,
          duracion: duracion,
          comentario: pausa.comentario
        });
      });
      
      // Convertir a array para mejor procesamiento en frontend
      const pausasTipos = Object.keys(pausasPorTipo).map(tipo => ({
        tipo,
        cantidad: pausasPorTipo[tipo].cantidad,
        tiempoTotal: pausasPorTipo[tipo].tiempoTotal,
        porcentaje: tiempoPausaTotal > 0 ? (pausasPorTipo[tipo].tiempoTotal / tiempoPausaTotal) * 100 : 0,
        detalle: pausasPorTipo[tipo].detalle
      }));
      
      // Construir respuesta
      const reporte = {
        ordenFabricacion: {
          id: orden.id,
          codigoOrden: orden.codigoOrden,
          codigoArticulo: orden.codigoArticulo,
          descripcion: orden.descripcion,
          estado: orden.estado,
          fechaCreacion: orden.horaCreacion,
          fechaInicio: orden.horaInicio,
          fechaFin: orden.horaFin
        },
        produccion: {
          cantidad: orden.cantidad,
          botesBuenos: orden.botesBuenos,
          botesExpulsados: orden.botesExpulsados,
          botesOperario: orden.botesOperario,
          cajasContadas: orden.cajasContadas,
          botesPorCaja: orden.botesPorCaja,
          completado: orden.botesBuenos / orden.cantidad * 100,
          diferenciaBotes,
          porcentajeDiferencia
        },
        tiempos: {
          tiempoTotal,
          tiempoActivo: tiempoTotal - orden.tiempoPausado,
          tiempoPausado: orden.tiempoPausado,
          eficiencia: eficiencia.toFixed(2)
        },
        pausas: {
          total: orden.pausas.length,
          tiempoTotal: tiempoPausaTotal,
          porTipo: pausasTipos
        },
        corteSanitario: {
          requerido: orden.llevaNumeroCorteSanitario,
          inicial: orden.numeroCorteSanitarioInicial,
          final: orden.numeroCorteSanitarioFinal
        }
      };
      
      return res.status(200).json(reporte);
    } catch (error) {
      console.error('Error al generar reporte de orden:', error);
      return res.status(500).json({
        message: 'Error al generar reporte',
        error: error.message
      });
    }
  },
  // controllers/reporteController.js (Part 2)
  // Reporte general de producción en un período
  getReporteProduccion: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda
      const whereCondition = {
        horaCreacion: {
          [Op.between]: [inicio, fin]
        }
      };
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        whereCondition.maquinaId = maquinaId;
      }
      
      // Buscar órdenes de fabricación en el período
      const ordenes = await OrdenFabricacion.findAll({
        where: whereCondition,
        include: [{
          model: Pausa,
          as: 'pausas',
          required: false
        }]
      });
      
      // Estadísticas generales
      const totalOrdenes = ordenes.length;
      const ordenesFinalizadas = ordenes.filter(o => o.estado === 'finalizada').length;
      const ordenesPausadas = ordenes.filter(o => o.estado === 'pausada').length;
      const ordenesActivas = ordenes.filter(o => o.estado === 'iniciada').length;
      const ordenesPendientes = ordenes.filter(o => o.estado === 'creada').length;
      
      // Totales de producción
      let totalBotesBuenos = 0;
      let totalBotesExpulsados = 0;
      let totalBotesOperario = 0;
      let totalCajas = 0;
      let totalTiempoActivo = 0;
      let totalTiempoPausado = 0;
      
      // Eficiencia
      let tiempoTotal = 0;
      
      // Contadores por tipo de pausa
      const pausasPorTipo = {};
      
      // Procesar cada orden
      ordenes.forEach(orden => {
        // Sumar contadores
        totalBotesBuenos += orden.botesBuenos;
        totalBotesExpulsados += orden.botesExpulsados;
        totalBotesOperario += orden.botesOperario;
        totalCajas += orden.cajasContadas;
        totalTiempoActivo += orden.tiempoActivo;
        totalTiempoPausado += orden.tiempoPausado;
        
        // Calcular tiempo total
        if (orden.horaInicio) {
          const horaFin = orden.horaFin || new Date();
          const ordenTiempoTotal = Math.floor((horaFin - orden.horaInicio) / 1000);
          tiempoTotal += ordenTiempoTotal;
        }
        
        // Analizar pausas
        orden.pausas.forEach(pausa => {
          if (!pausasPorTipo[pausa.tipoPausa]) {
            pausasPorTipo[pausa.tipoPausa] = {
              cantidad: 0,
              tiempoTotal: 0
            };
          }
          
          pausasPorTipo[pausa.tipoPausa].cantidad++;
          pausasPorTipo[pausa.tipoPausa].tiempoTotal += pausa.duracion || 0;
        });
      });
      
      // Convertir pausas a array
      const pausasTipos = Object.keys(pausasPorTipo).map(tipo => ({
        tipo,
        cantidad: pausasPorTipo[tipo].cantidad,
        tiempoTotal: pausasPorTipo[tipo].tiempoTotal,
        tiempoPromedio: pausasPorTipo[tipo].cantidad > 0 ? 
          pausasPorTipo[tipo].tiempoTotal / pausasPorTipo[tipo].cantidad : 0,
        porcentaje: totalTiempoPausado > 0 ? 
          (pausasPorTipo[tipo].tiempoTotal / totalTiempoPausado) * 100 : 0
      }));
      
      // Ordenar por tipo más común
      pausasTipos.sort((a, b) => b.cantidad - a.cantidad);
      
      // Eficiencia general
      const eficienciaGeneral = tiempoTotal > 0 ? 
        ((tiempoTotal - totalTiempoPausado) / tiempoTotal) * 100 : 0;
      
      // Diferencia entre conteo operario y automático
      const diferenciaBotes = totalBotesOperario - totalBotesBuenos;
      const porcentajeDiferencia = totalBotesBuenos > 0 ? 
        (diferenciaBotes / totalBotesBuenos) * 100 : 0;
      
      // Construir respuesta
      const reporte = {
        periodo: {
          desde: inicio,
          hasta: fin,
          duracionDias: Math.floor((fin - inicio) / (1000 * 60 * 60 * 24))
        },
        ordenes: {
          total: totalOrdenes,
          finalizadas: ordenesFinalizadas,
          pausadas: ordenesPausadas,
          activas: ordenesActivas,
          pendientes: ordenesPendientes,
          porcentajeFinalizadas: totalOrdenes > 0 ? 
            (ordenesFinalizadas / totalOrdenes) * 100 : 0
        },
        produccion: {
          botesBuenos: totalBotesBuenos,
          botesExpulsados: totalBotesExpulsados,
          botesOperario: totalBotesOperario,
          cajas: totalCajas,
          promedioBotesPorOrden: ordenesFinalizadas > 0 ? 
            totalBotesBuenos / ordenesFinalizadas : 0,
          promedioCajasPorOrden: ordenesFinalizadas > 0 ? 
            totalCajas / ordenesFinalizadas : 0,
          diferenciaBotes,
          porcentajeDiferencia: porcentajeDiferencia.toFixed(2)
        },
        tiempos: {
          tiempoTotal,
          tiempoActivo: totalTiempoActivo,
          tiempoPausado: totalTiempoPausado,
          eficiencia: eficienciaGeneral.toFixed(2),
          promedioTiempoPorOrden: ordenesFinalizadas > 0 ? 
            tiempoTotal / ordenesFinalizadas : 0,
          promedioPausasPorOrden: ordenesFinalizadas > 0 ? 
            totalTiempoPausado / ordenesFinalizadas : 0
        },
        pausas: {
          tipos: pausasTipos,
          promediosPausasPorOrden: totalOrdenes > 0 ? 
            ordenesFinalizadas / totalOrdenes : 0
        }
      };
      
      return res.status(200).json(reporte);
    } catch (error) {
      console.error('Error al generar reporte de producción:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de producción',
        error: error.message
      });
    }
  },
  // controllers/reporteController.js (Part 3)
  // Reporte de eficiencia por día
  getReporteEficienciaDiaria: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda
      const whereCondition = {
        horaFin: {
          [Op.between]: [inicio, fin]
        },
        estado: 'finalizada'
      };
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        whereCondition.maquinaId = maquinaId;
      }
      
      // Obtener todas las órdenes finalizadas en el período
      const ordenes = await OrdenFabricacion.findAll({
        where: whereCondition,
        include: [{
          model: Pausa,
          as: 'pausas',
          required: false
        }]
      });
      
      // Agrupar por día
      const eficienciaPorDia = {};
      
      ordenes.forEach(orden => {
        // Obtener fecha sin hora
        const fecha = new Date(orden.horaFin);
        fecha.setHours(0, 0, 0, 0);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        if (!eficienciaPorDia[fechaStr]) {
          eficienciaPorDia[fechaStr] = {
            fecha: fechaStr,
            tiempoTotal: 0,
            tiempoActivo: 0,
            tiempoPausado: 0,
            ordenes: 0,
            botesBuenos: 0,
            botesExpulsados: 0,
            cajas: 0
          };
        }
        
        const tiempoTotal = Math.floor((orden.horaFin - orden.horaInicio) / 1000);
        
        eficienciaPorDia[fechaStr].tiempoTotal += tiempoTotal;
        eficienciaPorDia[fechaStr].tiempoActivo += orden.tiempoActivo;
        eficienciaPorDia[fechaStr].tiempoPausado += orden.tiempoPausado;
        eficienciaPorDia[fechaStr].ordenes += 1;
        eficienciaPorDia[fechaStr].botesBuenos += orden.botesBuenos;
        eficienciaPorDia[fechaStr].botesExpulsados += orden.botesExpulsados;
        eficienciaPorDia[fechaStr].cajas += orden.cajasContadas;
      });
      
      // Convertir a array y calcular eficiencia
      const eficienciaDiaria = Object.values(eficienciaPorDia).map(dia => ({
        ...dia,
        eficiencia: dia.tiempoTotal > 0 ? 
          ((dia.tiempoTotal - dia.tiempoPausado) / dia.tiempoTotal) * 100 : 0,
        promedioBotesPorOrden: dia.ordenes > 0 ? dia.botesBuenos / dia.ordenes : 0,
        promedioCajasPorOrden: dia.ordenes > 0 ? dia.cajas / dia.ordenes : 0
      }));
      
      // Ordenar por fecha
      eficienciaDiaria.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      
      return res.status(200).json({
        periodo: {
          desde: inicio,
          hasta: fin
        },
        dias: eficienciaDiaria
      });
    } catch (error) {
      console.error('Error al generar reporte de eficiencia diaria:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de eficiencia diaria',
        error: error.message
      });
    }
  },
  // controllers/reporteController.js (Part 4)
  // Análisis de pausas
  getReportePausas: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda para pausas
      const whereCondition = {
        horaInicio: {
          [Op.between]: [inicio, fin]
        }
      };
      
      // Construir condiciones adicionales para la relación con ordenFabricacion
      const ordenFabricacionWhere = {};
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        ordenFabricacionWhere.maquinaId = maquinaId;
      }
      
      // Obtener todas las pausas en el período
      const pausas = await Pausa.findAll({
        where: whereCondition,
        include: [{
          model: OrdenFabricacion,
          as: 'ordenFabricacion',
          attributes: ['id', 'codigoOrden', 'codigoArticulo', 'descripcion'],
          where: Object.keys(ordenFabricacionWhere).length > 0 ? ordenFabricacionWhere : undefined
        }]
      });
      
      // Agrupar por tipo
      const pausasPorTipo = {};
      
      pausas.forEach(pausa => {
        if (!pausasPorTipo[pausa.tipoPausa]) {
          pausasPorTipo[pausa.tipoPausa] = {
            tipo: pausa.tipoPausa,
            cantidad: 0,
            tiempoTotal: 0,
            duracionPromedio: 0,
            pausas: []
          };
        }
        
        const duracion = pausa.duracion || 0;
        
        pausasPorTipo[pausa.tipoPausa].cantidad++;
        pausasPorTipo[pausa.tipoPausa].tiempoTotal += duracion;
        pausasPorTipo[pausa.tipoPausa].pausas.push({
          id: pausa.id,
          inicio: pausa.horaInicio,
          fin: pausa.horaFin,
          duracion,
          ordenId: pausa.ordenFabricacionId,
          ordenCodigo: pausa.ordenFabricacion ? pausa.ordenFabricacion.codigoOrden : null,
          comentario: pausa.comentario
        });
      });
      
      // Calcular promedios y convertir a array
      const tiposPausa = Object.values(pausasPorTipo).map(tipo => ({
        ...tipo,
        duracionPromedio: tipo.cantidad > 0 ? tipo.tiempoTotal / tipo.cantidad : 0
      }));
      
      // Ordenar por tiempo total
      tiposPausa.sort((a, b) => b.tiempoTotal - a.tiempoTotal);
      
      // Totales generales
      const totalPausas = pausas.length;
      const tiempoTotalPausas = tiposPausa.reduce((sum, tipo) => sum + tipo.tiempoTotal, 0);
      const duracionPromedio = totalPausas > 0 ? tiempoTotalPausas / totalPausas : 0;
      
      return res.status(200).json({
        periodo: {
          desde: inicio,
          hasta: fin
        },
        resumen: {
          totalPausas,
          tiempoTotalPausas,
          duracionPromedio,
          tiposPausa: tiposPausa.length
        },
        tiposPausa
      });
    } catch (error) {
      console.error('Error al generar reporte de pausas:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de pausas',
        error: error.message
      });
    }
  },
  // controllers/reporteController.js (Part 5)
  // Reporte de comparación operario vs conteo automático
  getReporteComparativoBotes: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda
      const whereCondition = {
        horaFin: {
          [Op.between]: [inicio, fin]
        },
        estado: 'finalizada'
      };
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        whereCondition.maquinaId = maquinaId;
      }
      
      // Obtener órdenes finalizadas con ambos conteos
      const ordenes = await OrdenFabricacion.findAll({
        where: whereCondition,
        attributes: [
          'id', 'codigoOrden', 'codigoArticulo', 'descripcion',
          'botesBuenos', 'botesOperario', 'horaFin'
        ]
      });
      
      // Calcular diferencias
      const comparativas = ordenes.map(orden => {
        const diferencia = orden.botesOperario - orden.botesBuenos;
        const porcentajeDiferencia = orden.botesBuenos > 0 ? 
          (diferencia / orden.botesBuenos) * 100 : 0;
        
        return {
          ordenId: orden.id,
          codigoOrden: orden.codigoOrden,
          codigoArticulo: orden.codigoArticulo,
          descripcion: orden.descripcion,
          fechaFin: orden.horaFin,
          conteoAutomatico: orden.botesBuenos,
          conteoOperario: orden.botesOperario,
          diferencia,
          porcentajeDiferencia
        };
      });
      
      // Ordenar por mayor diferencia
      comparativas.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
      
      // Calcular estadísticas generales
      const totalBotesAutomatico = ordenes.reduce((sum, orden) => sum + orden.botesBuenos, 0);
      const totalBotesOperario = ordenes.reduce((sum, orden) => sum + orden.botesOperario, 0);
      const diferenciaTotal = totalBotesOperario - totalBotesAutomatico;
      const porcentajeDiferenciaTotal = totalBotesAutomatico > 0 ? 
        (diferenciaTotal / totalBotesAutomatico) * 100 : 0;
      
      // Contar órdenes por tipo de diferencia
      const ordenesExactas = comparativas.filter(c => c.diferencia === 0).length;
      const ordenesMayorOperario = comparativas.filter(c => c.diferencia > 0).length;
      const ordenesMayorAutomatico = comparativas.filter(c => c.diferencia < 0).length;
      
      return res.status(200).json({
        periodo: {
          desde: inicio,
          hasta: fin
        },
        resumen: {
          totalOrdenes: ordenes.length,
          ordenesExactas,
          ordenesMayorOperario,
          ordenesMayorAutomatico,
          totalBotesAutomatico,
          totalBotesOperario,
          diferenciaTotal,
          porcentajeDiferenciaTotal: porcentajeDiferenciaTotal.toFixed(2)
        },
        comparativa: comparativas
      });
    } catch (error) {
      console.error('Error al generar reporte comparativo:', error);
      return res.status(500).json({
        message: 'Error al generar reporte comparativo',
        error: error.message
      });
    }
  },
  // controllers/reporteController.js (Part 6)
  // Reporte de limpiezas
  getReporteLimpiezas: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda
      const whereCondition = {
        horaCreacion: {
          [Op.between]: [inicio, fin]
        }
      };
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        whereCondition.maquinaId = maquinaId;
      }
      
      // Obtener todas las órdenes de limpieza en el período
      const limpiezas = await OrdenLimpieza.findAll({
        where: whereCondition
      });
      
      // Estadísticas generales
      const totalLimpiezas = limpiezas.length;
      const limpiezasFinalizadas = limpiezas.filter(l => l.estado === 'finalizada').length;
      const limpiezasActivas = limpiezas.filter(l => l.estado === 'iniciada').length;
      const limpiezasPendientes = limpiezas.filter(l => l.estado === 'creada').length;
      
      // Tiempos
      let tiempoTotalLimpieza = 0;
      
      limpiezas.forEach(limpieza => {
        if (limpieza.duracion) {
          tiempoTotalLimpieza += limpieza.duracion;
        }
      });
      
      // Duraciones promedio
      const duracionPromedio = limpiezasFinalizadas > 0 ? 
        tiempoTotalLimpieza / limpiezasFinalizadas : 0;
      
      // Agrupar por día para ver tendencias
      const limpiezasPorDia = {};
      
      limpiezas.forEach(limpieza => {
        // Obtener fecha sin hora
        const fecha = new Date(limpieza.horaCreacion);
        fecha.setHours(0, 0, 0, 0);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        if (!limpiezasPorDia[fechaStr]) {
          limpiezasPorDia[fechaStr] = {
            fecha: fechaStr,
            total: 0,
            finalizadas: 0,
            tiempoTotal: 0
          };
        }
        
        limpiezasPorDia[fechaStr].total++;
        
        if (limpieza.estado === 'finalizada') {
          limpiezasPorDia[fechaStr].finalizadas++;
          limpiezasPorDia[fechaStr].tiempoTotal += limpieza.duracion || 0;
        }
      });
      
      // Convertir a array y calcular promedios
      const diasLimpieza = Object.values(limpiezasPorDia).map(dia => ({
        ...dia,
        promedioDuracion: dia.finalizadas > 0 ? dia.tiempoTotal / dia.finalizadas : 0
      }));
      
      // Ordenar por fecha
      diasLimpieza.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      
      // Detalle de todas las limpiezas
      const detalleLimpiezas = limpiezas.map(limpieza => ({
        id: limpieza.id,
        descripcion: limpieza.descripcion,
        estado: limpieza.estado,
        horaCreacion: limpieza.horaCreacion,
        horaInicio: limpieza.horaInicio,
        horaFin: limpieza.horaFin,
        duracion: limpieza.duracion
      }));
      
      return res.status(200).json({
        periodo: {
          desde: inicio,
          hasta: fin
        },
        resumen: {
          totalLimpiezas,
          limpiezasFinalizadas,
          limpiezasActivas,
          limpiezasPendientes,
          tiempoTotalLimpieza,
          duracionPromedio
        },
        tendencia: diasLimpieza,
        detalle: detalleLimpiezas
      });
    } catch (error) {
      console.error('Error al generar reporte de limpiezas:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de limpiezas',
        error: error.message
      });
    }
  },

  // Reporte de indicadores clave de rendimiento (KPIs)
  getReporteKPI: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, maquinaId } = req.query;
      
      // Validar parámetros
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 30));
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      // Construir condiciones de búsqueda
      const whereCondition = {
        estado: 'finalizada',
        horaFin: {
          [Op.between]: [inicio, fin]
        }
      };
      
      // Si se especifica una máquina, filtrar por ella
      if (maquinaId) {
        whereCondition.maquinaId = maquinaId;
      }
      
      // Obtener órdenes finalizadas en el período
      const ordenes = await OrdenFabricacion.findAll({
        where: whereCondition,
        include: [{
          model: Pausa,
          as: 'pausas',
          required: false
        }]
      });
      
      // Calcular KPIs
      
      // 1. Productividad (botes por hora)
      const totalBotes = ordenes.reduce((sum, orden) => sum + orden.botesBuenos, 0);
      const totalTiempoActivo = ordenes.reduce((sum, orden) => sum + orden.tiempoActivo, 0) / 3600; // en horas
      const productividad = totalTiempoActivo > 0 ? totalBotes / totalTiempoActivo : 0;
      
      // 2. Eficiencia (tiempo activo vs tiempo total)
      const totalTiempo = ordenes.reduce((sum, orden) => {
        if (orden.horaInicio && orden.horaFin) {
          return sum + Math.floor((orden.horaFin - orden.horaInicio) / 1000);
        }
        return sum;
      }, 0);
      
      const totalTiempoPausado = ordenes.reduce((sum, orden) => sum + orden.tiempoPausado, 0);
      const eficiencia = totalTiempo > 0 ? ((totalTiempo - totalTiempoPausado) / totalTiempo) * 100 : 0;
      
      // 3. Tasa de rechazo (botes expulsados / total producidos)
      const totalBotesExpulsados = ordenes.reduce((sum, orden) => sum + orden.botesExpulsados, 0);
      const totalProducido = totalBotes + totalBotesExpulsados;
      const tasaRechazo = totalProducido > 0 ? (totalBotesExpulsados / totalProducido) * 100 : 0;
      
      // 4. Precisión del operario
      const totalBotesOperario = ordenes.reduce((sum, orden) => sum + orden.botesOperario, 0);
      const diferenciaConteo = totalBotesOperario - totalBotes;
      const precisionOperario = totalBotes > 0 ? 100 - Math.abs((diferenciaConteo / totalBotes) * 100) : 0;
      
      // 5. Tiempo medio entre pausas
      let totalPausas = 0;
      ordenes.forEach(orden => {
        totalPausas += orden.pausas.length;
      });
      
      const tiempoMedioPausas = totalPausas > 0 ? totalTiempoActivo / totalPausas : 0;
      
      // 6. Tasa de cumplimiento de producción
      const totalPlanificado = ordenes.reduce((sum, orden) => sum + orden.cantidad, 0);
      const tasaCumplimiento = totalPlanificado > 0 ? (totalBotes / totalPlanificado) * 100 : 0;
      
      // 7. OEE (Overall Equipment Effectiveness) simplificado
      // OEE = Disponibilidad * Rendimiento * Calidad
      const disponibilidad = eficiencia / 100; // Ya calculado como eficiencia
      const rendimiento = totalPlanificado > 0 ? Math.min(totalBotes / totalPlanificado, 1) : 0;
      const calidad = totalProducido > 0 ? (totalBotes / totalProducido) : 0;
      const oee = disponibilidad * rendimiento * calidad * 100;
      
      // Agrupar datos por día para tendencias
      const kpisPorDia = {};
      
      ordenes.forEach(orden => {
        const fecha = new Date(orden.horaFin);
        fecha.setHours(0, 0, 0, 0);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        if (!kpisPorDia[fechaStr]) {
          kpisPorDia[fechaStr] = {
            fecha: fechaStr,
            botesBuenos: 0,
            botesExpulsados: 0,
            tiempoActivo: 0,
            tiempoPausado: 0,
            tiempoTotal: 0,
            ordenes: 0
          };
        }
        
        kpisPorDia[fechaStr].botesBuenos += orden.botesBuenos;
        kpisPorDia[fechaStr].botesExpulsados += orden.botesExpulsados;
        kpisPorDia[fechaStr].tiempoActivo += orden.tiempoActivo;
        kpisPorDia[fechaStr].tiempoPausado += orden.tiempoPausado;
        kpisPorDia[fechaStr].ordenes += 1;
        
        if (orden.horaInicio && orden.horaFin) {
          kpisPorDia[fechaStr].tiempoTotal += Math.floor((orden.horaFin - orden.horaInicio) / 1000);
        }
      });
      
      // Calcular KPIs por día
      const kpisDiarios = Object.values(kpisPorDia).map(dia => {
        const diaEficiencia = dia.tiempoTotal > 0 ? ((dia.tiempoTotal - dia.tiempoPausado) / dia.tiempoTotal) * 100 : 0;
        const diaProductividad = (dia.tiempoActivo / 3600) > 0 ? dia.botesBuenos / (dia.tiempoActivo / 3600) : 0;
        const diaTasaRechazo = (dia.botesBuenos + dia.botesExpulsados) > 0 ? 
          (dia.botesExpulsados / (dia.botesBuenos + dia.botesExpulsados)) * 100 : 0;
        
        return {
          ...dia,
          eficiencia: diaEficiencia,
          productividad: diaProductividad,
          tasaRechazo: diaTasaRechazo
        };
      });
      
      // Ordenar por fecha
      kpisDiarios.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      
      return res.status(200).json({
        periodo: {
          desde: inicio,
          hasta: fin
        },
        resumen: {
          totalOrdenes: ordenes.length,
          totalProduccion: totalBotes,
          totalRechazo: totalBotesExpulsados,
          tiempoTotal: totalTiempo,
          tiempoActivo: totalTiempoActivo * 3600, // Convertir horas a segundos
          tiempoPausado: totalTiempoPausado
        },
        kpis: {
          productividad: productividad.toFixed(2),
          eficiencia: eficiencia.toFixed(2),
          tasaRechazo: tasaRechazo.toFixed(2),
          precisionOperario: precisionOperario.toFixed(2),
          tiempoMedioPausas: tiempoMedioPausas.toFixed(2),
          tasaCumplimiento: tasaCumplimiento.toFixed(2),
          oee: oee.toFixed(2)
        },
        tendencia: kpisDiarios
      });
    } catch (error) {
      console.error('Error al generar reporte de KPIs:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de KPIs',
        error: error.message
      });
    }
  },// controllers/reporteController.js (Part 7)
  // Reporte de estado de máquinas
  getReporteEstadoMaquinas: async (req, res) => {
    try {
      // En un sistema real, buscarías esta información en la base de datos
      // Por ahora, simulamos datos para las 12 máquinas
      const maquinas = [
        { id: 1, nombre: 'Cremer', tipo: 'Envasado', ubicacion: 'Planta 1', estado: 'active' },
        { id: 2, nombre: 'Etiquetadora', tipo: 'Etiquetado', ubicacion: 'Planta 1', estado: 'active' },
        { id: 3, nombre: 'Embotelladora 1', tipo: 'Embotellado', ubicacion: 'Planta 1', estado: 'maintenance' },
        { id: 4, nombre: 'Embotelladora 2', tipo: 'Embotellado', ubicacion: 'Planta 1', estado: 'active' },
        { id: 5, nombre: 'Tapadora', tipo: 'Sellado', ubicacion: 'Planta 1', estado: 'active' },
        { id: 6, nombre: 'Mezcladora', tipo: 'Preparación', ubicacion: 'Planta 2', estado: 'error' },
        { id: 7, nombre: 'Pasteurizadora', tipo: 'Tratamiento', ubicacion: 'Planta 2', estado: 'active' },
        { id: 8, nombre: 'Filtradora', tipo: 'Filtrado', ubicacion: 'Planta 2', estado: 'active' },
        { id: 9, nombre: 'Secadora', tipo: 'Secado', ubicacion: 'Planta 2', estado: 'maintenance' },
        { id: 10, nombre: 'Empaquetadora', tipo: 'Empaquetado', ubicacion: 'Planta 3', estado: 'active' },
        { id: 11, nombre: 'Paletizadora', tipo: 'Paletizado', ubicacion: 'Planta 3', estado: 'active' },
        { id: 12, nombre: 'Envolvedor', tipo: 'Embalaje', ubicacion: 'Planta 3', estado: 'active' }
      ];
      
      // Añadir estadísticas simuladas
      const maquinasConEstado = await Promise.all(maquinas.map(async (maquina) => {
        // En un sistema real, obtendríamos estas estadísticas de la base de datos
        // Por ahora, simulamos datos
        let estadisticas = {
          ordenesHoy: Math.floor(Math.random() * 5),
          botesBuenos: Math.floor(Math.random() * 5000),
          botesExpulsados: Math.floor(Math.random() * 200),
          eficiencia: 75 + Math.floor(Math.random() * 20),
          ultimaActividad: new Date(Date.now() - Math.floor(Math.random() * 86400000)) // Últimas 24 horas
        };
        
        // Simular orden activa para algunas máquinas
        const tieneOrdenActiva = Math.random() > 0.7;
        let ordenActiva = null;
        
        if (tieneOrdenActiva && maquina.estado === 'active') {
          ordenActiva = {
            id: Math.floor(Math.random() * 1000),
            codigoOrden: `ORD-${Math.floor(Math.random() * 10000)}`,
            codigoArticulo: `ART-${Math.floor(Math.random() * 1000)}`,
            descripcion: 'Orden en proceso',
            botesBuenos: Math.floor(Math.random() * 1000),
            botesExpulsados: Math.floor(Math.random() * 50),
            cajasContadas: Math.floor(Math.random() * 100),
            tiempoActivo: Math.floor(Math.random() * 7200), // 0-2 horas en segundos
            estado: Math.random() > 0.3 ? 'iniciada' : 'pausada'
          };
        }
        
        return {
          ...maquina,
          estadisticas,
          ordenActiva
        };
      }));
      
      // Resumen general
      const resumen = {
        totalMaquinas: maquinas.length,
        activas: maquinas.filter(m => m.estado === 'active').length,
        mantenimiento: maquinas.filter(m => m.estado === 'maintenance').length,
        error: maquinas.filter(m => m.estado === 'error').length,
        ordenesActivas: maquinasConEstado.filter(m => m.ordenActiva).length
      };
      
      // Agrupar por ubicación
      const porUbicacion = {};
      maquinas.forEach(maquina => {
        if (!porUbicacion[maquina.ubicacion]) {
          porUbicacion[maquina.ubicacion] = {
            ubicacion: maquina.ubicacion,
            total: 0,
            activas: 0,
            mantenimiento: 0,
            error: 0
          };
        }
        
        porUbicacion[maquina.ubicacion].total++;
        if (maquina.estado === 'active') porUbicacion[maquina.ubicacion].activas++;
        if (maquina.estado === 'maintenance') porUbicacion[maquina.ubicacion].mantenimiento++;
        if (maquina.estado === 'error') porUbicacion[maquina.ubicacion].error++;
      });
      
      return res.status(200).json({
        timestamp: new Date(),
        resumen,
        porUbicacion: Object.values(porUbicacion),
        maquinas: maquinasConEstado
      });
    } catch (error) {
      console.error('Error al generar reporte de estado de máquinas:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de estado de máquinas',
        error: error.message
      });
    }
  },
  
  // Reporte detallado de una máquina específica
  getReporteMaquina: async (req, res) => {
    try {
      const { id } = req.params;
      
      // En un sistema real, buscarías esta información en la base de datos
      // Por ahora, simulamos datos para las 12 máquinas
      const maquinas = [
        { id: 1, nombre: 'Cremer', tipo: 'Envasado', ubicacion: 'Planta 1', modelo: 'CT-5000', fabricante: 'TechPack', añoInstalacion: 2020, estado: 'active', descripcion: 'Línea de envasado principal para productos líquidos.' },
        { id: 2, nombre: 'Etiquetadora', tipo: 'Etiquetado', ubicacion: 'Planta 1', modelo: 'LBL-2000', fabricante: 'LabeMaster', añoInstalacion: 2021, estado: 'active', descripcion: 'Sistema automático de etiquetado de botellas.' },
        { id: 3, nombre: 'Embotelladora 1', tipo: 'Embotellado', ubicacion: 'Planta 1', modelo: 'BTL-PRO', fabricante: 'FluidTech', añoInstalacion: 2019, estado: 'maintenance', descripcion: 'Embotelladora de alta velocidad para envases de 500ml a 2L.' },
        { id: 4, nombre: 'Embotelladora 2', tipo: 'Embotellado', ubicacion: 'Planta 1', modelo: 'BTL-MINI', fabricante: 'FluidTech', añoInstalacion: 2019, estado: 'active', descripcion: 'Embotelladora para formatos pequeños de 100ml a 500ml.' },
        { id: 5, nombre: 'Tapadora', tipo: 'Sellado', ubicacion: 'Planta 1', modelo: 'CAP-3000', fabricante: 'SealMaster', añoInstalacion: 2020, estado: 'active', descripcion: 'Sistema de sellado automático de tapas de rosca.' },
        { id: 6, nombre: 'Mezcladora', tipo: 'Preparación', ubicacion: 'Planta 2', modelo: 'MIX-500', fabricante: 'BlendPro', añoInstalacion: 2018, estado: 'error', descripcion: 'Equipo de mezcla de ingredientes de alta capacidad.' },
        { id: 7, nombre: 'Pasteurizadora', tipo: 'Tratamiento', ubicacion: 'Planta 2', modelo: 'PAST-UHT', fabricante: 'HeatProcess', añoInstalacion: 2020, estado: 'active', descripcion: 'Sistema de pasteurización por calor de última generación.' },
        { id: 8, nombre: 'Filtradora', tipo: 'Filtrado', ubicacion: 'Planta 2', modelo: 'FIL-MICRO', fabricante: 'PureTech', añoInstalacion: 2021, estado: 'active', descripcion: 'Sistema de filtrado de partículas para productos líquidos.' },
        { id: 9, nombre: 'Secadora', tipo: 'Secado', ubicacion: 'Planta 2', modelo: 'DRY-PRO', fabricante: 'AirTech', añoInstalacion: 2019, estado: 'maintenance', descripcion: 'Sistema de secado térmico para procesos especiales.' },
        { id: 10, nombre: 'Empaquetadora', tipo: 'Empaquetado', ubicacion: 'Planta 3', modelo: 'PACK-BOX', fabricante: 'BoxMaster', añoInstalacion: 2020, estado: 'active', descripcion: 'Sistema automático de empaquetado en cajas.' },
        { id: 11, nombre: 'Paletizadora', tipo: 'Paletizado', ubicacion: 'Planta 3', modelo: 'PAL-ROBOT', fabricante: 'RobotPack', añoInstalacion: 2021, estado: 'active', descripcion: 'Robot paletizador de cajas para fin de línea.' },
        { id: 12, nombre: 'Envolvedor', tipo: 'Embalaje', ubicacion: 'Planta 3', modelo: 'WRAP-3D', fabricante: 'FilmTech', añoInstalacion: 2020, estado: 'active', descripcion: 'Sistema de envoltura con film para palets terminados.' }
      ];
      
      const maquina = maquinas.find(m => m.id === parseInt(id));
      
      if (!maquina) {
        return res.status(404).json({
          message: 'Máquina no encontrada'
        });
      }
      
      // Simular historial de mantenimiento
      const historialMantenimiento = [];
      const numMantenimientos = 2 + Math.floor(Math.random() * 5);
      
      for (let i = 0; i < numMantenimientos; i++) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - Math.floor(Math.random() * 365)); // Último año
        
        historialMantenimiento.push({
          id: i + 1,
          fecha,
          tipo: Math.random() > 0.7 ? 'Preventivo' : 'Correctivo',
          descripcion: 'Mantenimiento ' + (Math.random() > 0.7 ? 'preventivo' : 'correctivo') + ' según calendario',
          tecnico: `Técnico ${Math.floor(Math.random() * 5) + 1}`,
          duracion: Math.floor(Math.random() * 480) + 60 // 1-9 horas en minutos
        });
      }
      
      // Ordenar por fecha (más reciente primero)
      historialMantenimiento.sort((a, b) => b.fecha - a.fecha);
      
      // Simular datos de producción reciente
      const produccionReciente = [];
      const diasHistorial = 7;
      
      for (let i = 0; i < diasHistorial; i++) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - i);
        fecha.setHours(0, 0, 0, 0);
        
        produccionReciente.push({
          fecha: fecha.toISOString().split('T')[0],
          botesBuenos: 3000 + Math.floor(Math.random() * 2000),
          botesExpulsados: 50 + Math.floor(Math.random() * 150),
          ordenes: 1 + Math.floor(Math.random() * 3),
          tiempoActivo: 6 * 3600 + Math.floor(Math.random() * 7200), // 6-8 horas en segundos
          tiempoPausado: Math.floor(Math.random() * 3600), // 0-1 hora en segundos
          eficiencia: 75 + Math.floor(Math.random() * 20) // 75-95%
        });
      }
      
      // Ordenar por fecha
      produccionReciente.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      
      // Simular KPIs
      const kpis = {
        mtbf: 80 + Math.floor(Math.random() * 40), // Mean Time Between Failures (hours)
        mttr: 1 + Math.floor(Math.random() * 4), // Mean Time To Repair (hours)
        disponibilidad: 90 + Math.floor(Math.random() * 8), // Availability (%)
        oee: 75 + Math.floor(Math.random() * 15), // Overall Equipment Effectiveness (%)
        productividad: 400 + Math.floor(Math.random() * 200), // Productivity (items/hour)
        tasaRechazo: 1 + Math.floor(Math.random() * 3) // Rejection rate (%)
      };
      
      return res.status(200).json({
        timestamp: new Date(),
        maquina,
        historialMantenimiento,
        produccionReciente,
        kpis,
        proximoMantenimiento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // En 15 días
      });
    } catch (error) {
      console.error('Error al generar reporte de máquina:', error);
      return res.status(500).json({
        message: 'Error al generar reporte de máquina',
        error: error.message
      });
    }
  }
};

module.exports = reporteController;