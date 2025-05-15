const { OrdenLimpieza, OrdenFabricacion } = require('../models');
const { sequelize } = require('../config/database');

// Obtener todas las órdenes de limpieza
exports.getAll = async (req, res) => {
  try {
    const ordenesL = await OrdenLimpieza.findAll({
      order: [['createdAt', 'DESC']]
    });
    
    return res.status(200).json(ordenesL);
  } catch (error) {
    console.error('Error al obtener órdenes de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al obtener órdenes de limpieza',
      error: error.message 
    });
  }
};

// Obtener una orden de limpieza por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ordenL = await OrdenLimpieza.findByPk(id);
    
    if (!ordenL) {
      return res.status(404).json({ message: 'Orden de limpieza no encontrada' });
    }
    
    return res.status(200).json(ordenL);
  } catch (error) {
    console.error('Error al obtener orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al obtener orden de limpieza',
      error: error.message 
    });
  }
};

// Crear una nueva orden de limpieza
exports.create = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const ordenL = await OrdenLimpieza.create({
      ...req.body,
      estado: 'creada'
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenLimpieza:created', ordenL);
    
    return res.status(201).json(ordenL);
  } catch (error) {
    await transaction.rollback();
    console.error('Error al crear orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al crear orden de limpieza',
      error: error.message 
    });
  }
};

// Iniciar una orden de limpieza
exports.iniciar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenL = await OrdenLimpieza.findByPk(id, { transaction });
    
    if (!ordenL) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de limpieza no encontrada' });
    }
    
    if (ordenL.estado !== 'creada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `No se puede iniciar una orden en estado ${ordenL.estado}` 
      });
    }
    
    // Actualizar la orden
    await ordenL.update({
      estado: 'iniciada',
      horaInicio: new Date()
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenLimpieza:updated', await OrdenLimpieza.findByPk(id));
    
    return res.status(200).json({ 
      message: 'Orden de limpieza iniciada correctamente',
      orden: await OrdenLimpieza.findByPk(id)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al iniciar orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al iniciar orden de limpieza',
      error: error.message 
    });
  }
};

// Finalizar una orden de limpieza
exports.finalizar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenL = await OrdenLimpieza.findByPk(id, { transaction });
    
    if (!ordenL) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de limpieza no encontrada' });
    }
    
    if (ordenL.estado !== 'iniciada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Solo se puede finalizar una orden que esté iniciada' 
      });
    }
    
    // Calcular la duración
    const ahora = new Date();
    const duracion = Math.floor((ahora - ordenL.horaInicio) / 1000); // en segundos
    
    // Actualizar la orden
    await ordenL.update({
      estado: 'finalizada',
      horaFin: ahora,
      duracion
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenLimpieza:updated', await OrdenLimpieza.findByPk(id));
    
    return res.status(200).json({ 
      message: 'Orden de limpieza finalizada correctamente',
      orden: await OrdenLimpieza.findByPk(id)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al finalizar orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al finalizar orden de limpieza',
      error: error.message 
    });
  }
};

// Actualizar una orden de limpieza
exports.update = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenL = await OrdenLimpieza.findByPk(id, { transaction });
    
    if (!ordenL) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de limpieza no encontrada' });
    }
    
    // No permitir cambiar el estado a través de este endpoint
    if (req.body.estado) {
      delete req.body.estado;
    }
    
    await ordenL.update(req.body, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenLimpieza:updated', await OrdenLimpieza.findByPk(id));
    
    return res.status(200).json({ 
      message: 'Orden de limpieza actualizada correctamente',
      orden: await OrdenLimpieza.findByPk(id)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al actualizar orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al actualizar orden de limpieza',
      error: error.message 
    });
  }
};

// Eliminar una orden de limpieza
exports.delete = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenL = await OrdenLimpieza.findByPk(id, { transaction });
    
    if (!ordenL) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de limpieza no encontrada' });
    }
    
    // Solo permitir eliminar órdenes en estado 'creada'
    if (ordenL.estado !== 'creada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `No se puede eliminar una orden en estado ${ordenL.estado}` 
      });
    }
    
    // Eliminar la orden
    await ordenL.destroy({ transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenLimpieza:deleted', id);
    
    return res.status(200).json({ 
      message: 'Orden de limpieza eliminada correctamente',
      id
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al eliminar orden de limpieza:', error);
    return res.status(500).json({ 
      message: 'Error al eliminar orden de limpieza',
      error: error.message 
    });
  }
};