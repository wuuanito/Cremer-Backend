// Controlador de Pausas (pausaController.js)

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

// Finalizar una pausa (reanudar la orden)
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
    
    // Actualizar el tiempo pausado de la orden
    await ordenF.update({
      estado: 'iniciada',
      tiempoPausado: (ordenF.tiempoPausado || 0) + duracionPausa
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: 'Pausa finalizada correctamente',
      pausa: await Pausa.findByPk(id),
      orden: await OrdenFabricacion.findByPk(pausa.ordenFabricacionId, { include: ['pausas'] })
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

// Actualizar una pausa (solo comentario)
exports.update = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { comentario } = req.body;
    
    if (!comentario) {
      await transaction.rollback();
      return res.status(400).json({ message: 'El comentario es obligatorio' });
    }
    
    const pausa = await Pausa.findByPk(id, { transaction });
    
    if (!pausa) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Pausa no encontrada' });
    }
    
    await pausa.update({ comentario }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('pausa:updated', await Pausa.findByPk(id));
    
    return res.status(200).json({ 
      message: 'Pausa actualizada correctamente',
      pausa: await Pausa.findByPk(id)
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