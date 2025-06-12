// Controlador de Pausas Actualizado (pausaController.js)

const { Pausa, OrdenFabricacion } = require('../models');
const { sequelize } = require('../config/database');

// Obtener todas las pausas
exports.getAll = async (req, res) => {
  try {
    const pausas = await Pausa.findAll({
      include: ['ordenFabricacion'],
      order: [['createdAt', 'DESC']]
    });
    
    return res.status(200).json(pausas);
  } catch (error) {
    console.error('Error al obtener pausas:', error);
    return res.status(500).json({ 
      message: 'Error al obtener pausas',
      error: error.message 
    });
  }
};

// Obtener una pausa por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const pausa = await Pausa.findByPk(id, {
      include: ['ordenFabricacion']
    });
    
    if (!pausa) {
      return res.status(404).json({ message: 'Pausa no encontrada' });
    }
    
    return res.status(200).json(pausa);
  } catch (error) {
    console.error('Error al obtener pausa:', error);
    return res.status(500).json({ 
      message: 'Error al obtener pausa',
      error: error.message 
    });
  }
};

// Obtener todas las pausas de una orden de fabricación
exports.getByOrdenFabricacion = async (req, res) => {
  try {
    const { ordenFabricacionId } = req.params;
    
    const pausas = await Pausa.findAll({
      where: { ordenFabricacionId },
      order: [['horaInicio', 'DESC']]
    });
    
    return res.status(200).json(pausas);
  } catch (error) {
    console.error('Error al obtener pausas de la orden:', error);
    return res.status(500).json({ 
      message: 'Error al obtener pausas de la orden',
      error: error.message 
    });
  }
};

// Obtener estadísticas de pausas por tipo
exports.getEstadisticasPausas = async (req, res) => {
  try {
    const { ordenFabricacionId } = req.params;
    
    const pausas = await Pausa.findAll({
      where: { 
        ordenFabricacionId,
        horaFin: { [require('sequelize').Op.ne]: null } // Solo pausas finalizadas
      },
      order: [['horaInicio', 'ASC']]
    });
    
    // Agrupar pausas por tipo
    const estadisticas = {
      pausasNormales: [],
      pausasCambioTurno: [],
      pausasParciales: [],
      otroTipoPausas: [],
      resumen: {
        totalPausas: pausas.length,
        tiempoTotalPausas: 0,
        tiempoPausasQueComputan: 0,
        tiempoPausasNoComputan: 0
      }
    };
    
    pausas.forEach(pausa => {
      const duracion = pausa.duracion || 0;
      
      switch (pausa.tipoPausa) {
        case 'cambio_turno':
          estadisticas.pausasCambioTurno.push(pausa);
          estadisticas.resumen.tiempoPausasNoComputan += duracion;
          break;
        case 'pausa_parcial':
          estadisticas.pausasParciales.push(pausa);
          estadisticas.resumen.tiempoPausasNoComputan += duracion;
          break;
        case 'normal':
        case 'mantenimiento':
        case 'falta_material':
        default:
          if (pausa.tipoPausa === 'normal') {
            estadisticas.pausasNormales.push(pausa);
          } else {
            estadisticas.otroTipoPausas.push(pausa);
          }
          
          // Solo sumar si computa en tiempo (no es tipo especial)
          if (pausa.computaEnTiempo !== false && 
              pausa.tipoPausa !== 'cambio_turno' && 
              pausa.tipoPausa !== 'pausa_parcial') {
            estadisticas.resumen.tiempoPausasQueComputan += duracion;
          }
          break;
      }
      
      estadisticas.resumen.tiempoTotalPausas += duracion;
    });
    
    return res.status(200).json(estadisticas);
  } catch (error) {
    console.error('Error al obtener estadísticas de pausas:', error);
    return res.status(500).json({ 
      message: 'Error al obtener estadísticas de pausas',
      error: error.message 
    });
  }
};

// Finalizar una pausa (reanudar la orden) - ACTUALIZADO
exports.finalizarPausa = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const pausa = await Pausa.findByPk(id, { transaction });
    
    if (!pausa) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Pausa no encontrada' });
    }
    
    if (pausa.horaFin) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Esta pausa ya fue finalizada' });
    }
    
    // Verificar estado de la orden
    const ordenF = await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { transaction });
    
    if (!ordenF || ordenF.estado !== 'pausada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'No se puede finalizar la pausa porque la orden no está en estado pausada' 
      });
    }
    
    // Finalizar la pausa
    const ahora = new Date();
    // Calcular duración en minutos
    const duracionPausa = Math.floor((ahora - pausa.horaInicio) / (1000 * 60)); // en minutos
    
    await pausa.update({
      horaFin: ahora,
      duracion: duracionPausa
    }, { transaction });
    
    // Solo actualizar el tiempo pausado de la orden si la pausa computa en tiempo
    // No sumar tiempo si es cambio_turno o pausa_parcial
    let tiempoPausadoActualizado = ordenF.tiempoPausado || 0;
    
    if (pausa.computaEnTiempo !== false && 
        pausa.tipoPausa !== 'cambio_turno' && 
        pausa.tipoPausa !== 'pausa_parcial') {
      tiempoPausadoActualizado += duracionPausa;
    }
    
    await ordenF.update({
      estado: 'iniciada',
      tiempoPausado: tiempoPausadoActualizado
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { include: ['pausas'] }));
    
    const mensajeTipo = pausa.tipoPausa === 'cambio_turno' 
      ? ' (Cambio de turno - No computa en tiempo de pausas)'
      : pausa.tipoPausa === 'pausa_parcial'
      ? ' (Pausa parcial - No computa en tiempo de pausas)'
      : '';
    
    return res.status(200).json({ 
      message: `Pausa finalizada correctamente${mensajeTipo}`,
      pausa: await Pausa.findByPk(id),
      orden: await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { include: ['pausas'] }),
      duracionMinutos: duracionPausa,
      computaEnTiempo: pausa.computaEnTiempo !== false && 
                        pausa.tipoPausa !== 'cambio_turno' && 
                        pausa.tipoPausa !== 'pausa_parcial'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al finalizar pausa:', error);
    return res.status(500).json({ 
      message: 'Error al finalizar pausa',
      error: error.message 
    });
  }
};

// Crear una pausa manualmente (NUEVO)
exports.crearPausa = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ordenFabricacionId, tipoPausa, comentario } = req.body;
    
    if (!ordenFabricacionId || !tipoPausa) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'ordenFabricacionId y tipoPausa son obligatorios' 
      });
    }
    
    // Validar tipos de pausa permitidos
    const tiposPausaPermitidos = [
      'normal',           // Pausa normal que sí computa
      'cambio_turno',     // Pausa por cambio de turno (no computa)
      'pausa_parcial',    // Pausa parcial por orden urgente (no computa)
      'mantenimiento',    // Pausa por mantenimiento
      'falta_material',   // Pausa por falta de material
      'otros'            // Otros tipos de pausa
    ];
    
    if (!tiposPausaPermitidos.includes(tipoPausa)) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `Tipo de pausa no válido. Tipos permitidos: ${tiposPausaPermitidos.join(', ')}` 
      });
    }
    
    // Verificar que la orden existe
    const ordenF = await OrdenFabricacion.findByPk(ordenFabricacionId, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    // Crear el registro de pausa
    const pausa = await Pausa.create({
      ordenFabricacionId,
      horaInicio: new Date(),
      tipoPausa,
      comentario,
      // Agregar flag para identificar si computa en tiempo de pausas
      computaEnTiempo: !['cambio_turno', 'pausa_parcial'].includes(tipoPausa)
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('pausa:created', pausa);
    
    const mensajeTipoPausa = tipoPausa === 'cambio_turno' 
      ? ' (Cambio de turno - No computa en tiempo de pausas)'
      : tipoPausa === 'pausa_parcial'
      ? ' (Pausa parcial - No computa en tiempo de pausas)'
      : '';
    
    return res.status(201).json({ 
      message: `Pausa creada correctamente${mensajeTipoPausa}`,
      pausa,
      computaEnTiempo: pausa.computaEnTiempo
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al crear pausa:', error);
    return res.status(500).json({ 
      message: 'Error al crear pausa',
      error: error.message 
    });
  }
};

// Actualizar una pausa - ACTUALIZADO
exports.update = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { comentario, tipoPausa } = req.body;
    
    const pausa = await Pausa.findByPk(id, { transaction });
    
    if (!pausa) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Pausa no encontrada' });
    }
    
    const datosActualizacion = {};
    
    // Actualizar comentario si se proporciona
    if (comentario !== undefined) {
      datosActualizacion.comentario = comentario;
    }
    
    // Actualizar tipo de pausa si se proporciona y la pausa no está finalizada
    if (tipoPausa !== undefined) {
      if (pausa.horaFin) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: 'No se puede cambiar el tipo de una pausa ya finalizada' 
        });
      }
      
      // Validar tipo de pausa
      const tiposPausaPermitidos = [
        'normal', 'cambio_turno', 'pausa_parcial', 
        'mantenimiento', 'falta_material', 'otros'
      ];
      
      if (!tiposPausaPermitidos.includes(tipoPausa)) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `Tipo de pausa no válido. Tipos permitidos: ${tiposPausaPermitidos.join(', ')}` 
        });
      }
      
      datosActualizacion.tipoPausa = tipoPausa;
      datosActualizacion.computaEnTiempo = !['cambio_turno', 'pausa_parcial'].includes(tipoPausa);
    }
    
    if (Object.keys(datosActualizacion).length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Debe proporcionar al menos un campo para actualizar (comentario, tipoPausa)' 
      });
    }
    
    await pausa.update(datosActualizacion, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('pausa:updated', await Pausa.findByPk(id));
    
    return res.status(200).json({ 
      message: 'Pausa actualizada correctamente',
      pausa: await Pausa.findByPk(id),
      camposActualizados: Object.keys(datosActualizacion)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al actualizar pausa:', error);
    return res.status(500).json({ 
      message: 'Error al actualizar pausa',
      error: error.message 
    });
  }
};

// Eliminar una pausa (NUEVO)
exports.delete = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const pausa = await Pausa.findByPk(id, { transaction });
    
    if (!pausa) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Pausa no encontrada' });
    }
    
    // Solo permitir eliminar pausas que no estén activas (sin finalizar)
    if (!pausa.horaFin) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'No se puede eliminar una pausa activa. Primero debe finalizarla.' 
      });
    }
    
    // Verificar si la orden ya está finalizada
    const ordenF = await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { transaction });
    
    if (ordenF && ordenF.estado === 'finalizada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'No se puede eliminar una pausa cuando la orden ya está finalizada' 
      });
    }
    
    // Si la pausa computaba en tiempo, restar su duración del tiempo pausado de la orden
    if (ordenF && pausa.duracion && 
        pausa.computaEnTiempo !== false && 
        pausa.tipoPausa !== 'cambio_turno' && 
        pausa.tipoPausa !== 'pausa_parcial') {
      
      const nuevoTiempoPausado = Math.max(0, (ordenF.tiempoPausado || 0) - pausa.duracion);
      await ordenF.update({ tiempoPausado: nuevoTiempoPausado }, { transaction });
    }
    
    await pausa.destroy({ transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('pausa:deleted', id);
    
    if (ordenF) {
      io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { include: ['pausas'] }));
    }
    
    return res.status(200).json({ 
      message: 'Pausa eliminada correctamente',
      id
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al eliminar pausa:', error);
    return res.status(500).json({ 
      message: 'Error al eliminar pausa',
      error: error.message 
    });
  }
};

// Obtener tipos de pausa disponibles
// Obtener tipos de pausa disponibles
exports.getTiposPausa = async (req, res) => {
  try {
    // Lista completa de tipos de pausa
    const tiposPausa = [
      { value: 'Preparación Arranque', label: 'Preparación Arranque', computaEnTiempo: true },
      { value: 'Verificación Calidad', label: 'Verificación Calidad', computaEnTiempo: true },
      { value: 'Falta de Material', label: 'Falta de Material', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Posicionadora', label: 'Incidencia Máquina: Posicionadora', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Contadora', label: 'Incidencia Máquina: Contadora', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Taponadora', label: 'Incidencia Máquina: Taponadora', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Etiquetadora', label: 'Incidencia Máquina: Etiquetadora', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Controladora de Peso', label: 'Incidencia Máquina: Controladora de Peso', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Repercap', label: 'Incidencia Máquina: Repercap', computaEnTiempo: true },
      { value: 'Incidencia Máquina: Otros', label: 'Incidencia Máquina: Otros', computaEnTiempo: true },
      { value: 'Mantenimiento', label: 'Mantenimiento', computaEnTiempo: true },
      { value: 'cambio_turno', label: 'Cambio de Turno', computaEnTiempo: false },
      { value: 'pausa_parcial', label: 'Pausa Parcial', computaEnTiempo: false }
    ];
    
    // Separar en categorías
    const tiposQueComputan = tiposPausa.filter(tipo => tipo.computaEnTiempo);
    const tiposQueNoComputan = tiposPausa.filter(tipo => !tipo.computaEnTiempo);
    
    return res.status(200).json({
      message: 'Tipos de pausa disponibles',
      tiposPausa,
      tiposQueComputan,
      tiposQueNoComputan,
      tiposQueNoComputanValues: tiposQueNoComputan.map(t => t.value)
    });
  } catch (error) {
    console.error('Error al obtener tipos de pausa:', error);
    return res.status(500).json({ 
      message: 'Error al obtener tipos de pausa',
      error: error.message 
    });
  }
};