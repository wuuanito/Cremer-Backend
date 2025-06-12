const { OrdenFabricacion, Pausa } = require('../models');
const { sequelize } = require('../config/database');

// Obtener todas las órdenes de fabricación
exports.getAll = async (req, res) => {
  try {
    const ordenesF = await OrdenFabricacion.findAll({
      include: ['pausas'],
      order: [['createdAt', 'DESC']]
    });
    
    return res.status(200).json(ordenesF);
  } catch (error) {
    console.error('Error al obtener órdenes de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al obtener órdenes de fabricación',
      error: error.message 
    });
  }
};

// Obtener una orden de fabricación por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ordenF = await OrdenFabricacion.findByPk(id, {
      include: ['pausas']
    });
    
    if (!ordenF) {
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    return res.status(200).json(ordenF);
  } catch (error) {
    console.error('Error al obtener orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al obtener orden de fabricación',
      error: error.message 
    });
  }
};

// Crear una nueva orden de fabricación
exports.create = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('=== INICIO CREACIÓN ORDEN ===');
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    // Validar campos obligatorios
    const camposObligatorios = ['codigoOrden', 'codigoArticulo', 'producto', 'cantidadProducir', 'numeroCajas'];
    const camposFaltantes = camposObligatorios.filter(campo => !req.body[campo]);
    
    if (camposFaltantes.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'Faltan campos obligatorios',
        camposFaltantes
      });
    }
    
    // Preparar datos básicos necesarios
    const datosOrden = {
      codigoOrden: req.body.codigoOrden.trim(),
      codigoArticulo: req.body.codigoArticulo.trim(),
      producto: req.body.producto.trim(),
      cantidadProducir: parseInt(req.body.cantidadProducir),
      numeroCajas: parseInt(req.body.numeroCajas),
      repercap: Boolean(req.body.repercap),
      estado: 'creada',
      tiempoEstimadoProduccion: parseInt(req.body.cantidadProducir) / 2000
    };
    
    // Solo agregar campos opcionales si tienen valor
    if (req.body.botesPorCaja) {
      datosOrden.botesPorCaja = parseInt(req.body.botesPorCaja);
    }
    
    if (req.body.numeroCorteSanitarioInicial) {
      datosOrden.numeroCorteSanitarioInicial = parseInt(req.body.numeroCorteSanitarioInicial);
    }
    
    // Validaciones básicas
    if (datosOrden.cantidadProducir <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'La cantidad a producir debe ser mayor a 0'
      });
    }
    
    if (datosOrden.numeroCajas < 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'El número de cajas no puede ser negativo'
      });
    }
    
    if (datosOrden.repercap && !datosOrden.numeroCorteSanitarioInicial) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'El número de corte sanitario inicial es obligatorio cuando repercap está activado'
      });
    }
    
    console.log('Datos a insertar:', JSON.stringify(datosOrden, null, 2));
    
    // Crear la orden
    const ordenF = await OrdenFabricacion.create(datosOrden, { 
      transaction,
      returning: true
    });
    
    console.log('Orden creada exitosamente:', ordenF.id);
    
    await transaction.commit();
    
    // Obtener la orden completa
    const ordenCompleta = await OrdenFabricacion.findByPk(ordenF.id, {
      include: ['pausas']
    });
    
    console.log('=== ORDEN CREADA EXITOSAMENTE ===');
    console.log('ID:', ordenCompleta.id);
    console.log('Código:', ordenCompleta.codigoOrden);
    
    // Notificar socket.io
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('ordenFabricacion:created', ordenCompleta);
        console.log('Notificación socket.io enviada');
      }
    } catch (socketError) {
      console.error('Error socket.io:', socketError);
    }
    
    return res.status(201).json({
      message: 'Orden de fabricación creada exitosamente',
      orden: ordenCompleta
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('=== ERROR EN CREACIÓN DE ORDEN ===');
    console.error('Tipo de error:', error.name);
    console.error('Mensaje:', error.message);
    
    if (error.name === 'SequelizeValidationError') {
      const erroresValidacion = error.errors.map(err => ({
        campo: err.path,
        mensaje: err.message,
        valor: err.value
      }));
      
      return res.status(400).json({
        message: 'Error de validación en los datos',
        errores: erroresValidacion
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'Ya existe una orden con ese código',
        codigo: req.body.codigoOrden
      });
    }
    
    return res.status(500).json({
      message: 'Error al crear orden de fabricación',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
  }
};

// Iniciar una orden de fabricación
exports.iniciar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    // Verificar si hay alguna orden en estado 'iniciada'
    const ordenActiva = await OrdenFabricacion.findOne({
      where: { estado: 'iniciada' },
      transaction
    });
    
    if (ordenActiva) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'No se puede iniciar. Ya hay una orden de fabricación activa.' 
      });
    }
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado !== 'creada' && ordenF.estado !== 'pausada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `No se puede iniciar una orden en estado ${ordenF.estado}` 
      });
    }
    
    // Si la orden estaba pausada, cerrar la pausa activa
    if (ordenF.estado === 'pausada') {
      const pausaActiva = await Pausa.findOne({
        where: { 
          ordenFabricacionId: id,
          horaFin: null
        },
        transaction
      });
      
      if (pausaActiva) {
        const ahora = new Date();
        const duracionPausa = Math.floor((ahora - pausaActiva.horaInicio) / (1000 * 60));
        
        await pausaActiva.update({
          horaFin: ahora,
          duracion: duracionPausa
        }, { transaction });
        
        // Solo sumar al tiempo pausado si NO es un tipo especial de pausa
        if (pausaActiva.tipoPausa !== 'cambio_turno' && pausaActiva.tipoPausa !== 'pausa_parcial') {
          await ordenF.update({
            tiempoPausado: (ordenF.tiempoPausado || 0) + duracionPausa
          }, { transaction });
        }
      }
    }
    
    // Iniciar la orden
    const actualizacion = {
      estado: 'iniciada'
    };
    
    // Si es la primera vez que se inicia
    if (!ordenF.horaInicio) {
      actualizacion.horaInicio = new Date();
    }
    
    await ordenF.update(actualizacion, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: 'Orden de fabricación iniciada correctamente',
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al iniciar orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al iniciar orden de fabricación',
      error: error.message 
    });
  }
};

// Pausar una orden de fabricación (ACTUALIZADO)
exports.pausar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { tipoPausa, comentario } = req.body;
    
    if (!tipoPausa) {
      await transaction.rollback();
      return res.status(400).json({ message: 'El tipo de pausa es obligatorio' });
    }
    
    // Obtener todos los tipos de pausa disponibles
    // En ordenFabricacionController.js, en la función pausar
// Validar tipos de pausa permitidos
const tiposPausaPermitidos = [
  'Preparación Arranque',
  'Verificación Calidad',
  'Falta de Material',
  'Incidencia Máquina: Posicionadora',
  'Incidencia Máquina: Contadora',
  'Incidencia Máquina: Taponadora',
  'Incidencia Máquina: Etiquetadora',
  'Incidencia Máquina: Controladora de Peso',
  'Incidencia Máquina: Repercap',
  'Incidencia Máquina: Otros',
  'Mantenimiento',
  'cambio_turno',
  'pausa_parcial'
];

if (!tiposPausaPermitidos.includes(tipoPausa)) {
  await transaction.rollback();
  return res.status(400).json({ 
    message: `Tipo de pausa no válido. Tipos permitidos: ${tiposPausaPermitidos.join(', ')}` 
  });
}
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado !== 'iniciada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Solo se puede pausar una orden que esté iniciada' 
      });
    }
    
    // Determinar si computa en tiempo
    const computaEnTiempo = !['cambio_turno', 'pausa_parcial'].includes(tipoPausa);
    
    // Crear el registro de pausa
    const ahora = new Date();
    const pausa = await Pausa.create({
      ordenFabricacionId: id,
      horaInicio: ahora,
      tipoPausa,
      comentario,
      computaEnTiempo
    }, { transaction });
    
    // Actualizar el estado de la orden
    await ordenF.update({ 
      estado: 'pausada' 
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    const mensajeTipoPausa = !computaEnTiempo 
      ? ' (No computa en tiempo de pausas)'
      : '';
    
    return res.status(200).json({ 
      message: `Orden de fabricación pausada correctamente${mensajeTipoPausa}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] }),
      pausa,
      computaEnTiempo
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al pausar orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al pausar orden de fabricación',
      error: error.message 
    });
  }
};

// Función auxiliar para calcular tiempo total de pausas que sí computan
const calcularTiempoPausasQueComputan = async (ordenFabricacionId, transaction = null) => {
  const pausas = await Pausa.findAll({
    where: { 
      ordenFabricacionId,
      horaFin: { [require('sequelize').Op.ne]: null } // Solo pausas finalizadas
    },
    transaction
  });
  
  let tiempoPausadoTotalMinutos = 0;
  for (const pausa of pausas) {
    // Solo sumar si la pausa computa en tiempo (no es cambio_turno ni pausa_parcial)
    if (pausa.computaEnTiempo !== false && 
        pausa.tipoPausa !== 'cambio_turno' && 
        pausa.tipoPausa !== 'pausa_parcial' &&
        pausa.duracion !== null && 
        pausa.duracion !== undefined) {
      tiempoPausadoTotalMinutos += pausa.duracion;
    }
  }
  
  return tiempoPausadoTotalMinutos;
};

// Finalizar una orden de fabricación (ACTUALIZADO)
exports.finalizar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      unidadesCierreFin, 
      unidadesNoOkFin, 
      numeroCorteSanitarioFinal,
      unidadesPonderalTotal
    } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { 
      include: ['pausas'],
      transaction 
    });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada') {
      await transaction.rollback();
      return res.status(400).json({ message: 'La orden ya está finalizada' });
    }
    
    // Calcular botes buenos automáticamente si hay datos
    let botesBuenosCalculados = ordenF.botesBuenos || 0;
    if (ordenF.botesPorCaja && ordenF.botesPorCaja > 0 && ordenF.cajasContadas && ordenF.cajasContadas > 0) {
      botesBuenosCalculados = ordenF.botesPorCaja * ordenF.cajasContadas;
      console.log(`Botes buenos calculados automáticamente: ${ordenF.botesPorCaja} botes/caja * ${ordenF.cajasContadas} cajas = ${botesBuenosCalculados} botes`);
    }
    
    // Si la orden estaba pausada, cerrar la pausa activa
    if (ordenF.estado === 'pausada') {
      const pausaActiva = await Pausa.findOne({
        where: { 
          ordenFabricacionId: id,
          horaFin: null
        },
        transaction
      });
      
      if (pausaActiva) {
        const ahora = new Date();
        const duracionPausa = Math.floor((ahora - pausaActiva.horaInicio) / (1000 * 60));
        
        await pausaActiva.update({
          horaFin: ahora,
          duracion: duracionPausa
        }, { transaction });
      }
    }
    
    // Calcular el tiempo total pausado SOLO de pausas que computan
    const tiempoPausadoTotalMinutos = await calcularTiempoPausasQueComputan(id, transaction);
    
    // Calcular tiempos
    const ahora = new Date();
    let tiempoTotalMinutos = 0;
    
    if (ordenF.horaInicio) {
      tiempoTotalMinutos = Math.floor((ahora - ordenF.horaInicio) / (1000 * 60));
      if (tiempoTotalMinutos < 1) tiempoTotalMinutos = 1;
    }
    
    const tiempoActivoMinutos = tiempoTotalMinutos - tiempoPausadoTotalMinutos;
    
    // Convertir valores a números
    const unidadesCierreFinal = Number(unidadesCierreFin) || Number(botesBuenosCalculados) || Number(ordenF.unidadesCierreFin) || 0;
    const unidadesNoOkFinal = Number(unidadesNoOkFin) || Number(ordenF.unidadesNoOkFin) || 0;
    const unidadesExpulsadasFinal = Number(ordenF.botesExpulsados) || 0;
    const unidadesPonderalTotalFinal = Number(unidadesPonderalTotal) || Number(ordenF.unidadesPonderalTotal) || 0;
    
    // Total de unidades producidas
    const totalUnidades = unidadesCierreFinal + unidadesNoOkFinal;
    
    // Calcular unidades recuperadas automáticamente
    let unidadesRecuperadasCalculadas = 0;
    if (unidadesPonderalTotalFinal > 0 && botesBuenosCalculados > 0) {
      unidadesRecuperadasCalculadas = unidadesPonderalTotalFinal - botesBuenosCalculados;
      if (unidadesRecuperadasCalculadas < 0) {
        unidadesRecuperadasCalculadas = 0;
      }
    }
    
    // Calcular recirculación repercap
    let recirculacionRepercapCalculada = null;
    if (numeroCorteSanitarioFinal !== null && numeroCorteSanitarioFinal !== undefined && 
        ordenF.numeroCorteSanitarioInicial !== null && ordenF.numeroCorteSanitarioInicial !== undefined) {
      
      const corteFinal = Number(numeroCorteSanitarioFinal);
      const corteInicial = Number(ordenF.numeroCorteSanitarioInicial);
      recirculacionRepercapCalculada = (corteFinal - corteInicial) - totalUnidades;
    }
    
    // Calcular métricas
    const tiempoEstimadoProduccion = ordenF.cantidadProducir / 2000;
    const porcentajePausas = tiempoTotalMinutos > 0 ? (tiempoPausadoTotalMinutos / tiempoTotalMinutos) * 100 : 0;
    const porcentajeUnidadesOk = totalUnidades > 0 ? (unidadesCierreFinal / totalUnidades) * 100 : 0;
    const porcentajeUnidadesNoOk = totalUnidades > 0 ? (unidadesNoOkFinal / totalUnidades) * 100 : 0;
    const tasaExpulsion = totalUnidades > 0 ? (unidadesExpulsadasFinal / totalUnidades) * 100 : 0;
    const porcentajeCompletado = ordenF.cantidadProducir > 0 ? (unidadesCierreFinal / ordenF.cantidadProducir) * 100 : 0;
    
    // Calcular tasa de recuperación repercap
    let tasaRecuperacionRepercap = null;
    if (recirculacionRepercapCalculada !== null && totalUnidades > 0) {
      tasaRecuperacionRepercap = (recirculacionRepercapCalculada / totalUnidades) * 100;
    }
    
    // Estándar real (unidades/hora)
    let standardReal = 0;
    if (tiempoActivoMinutos > 0) {
      const unidadesPorMinuto = totalUnidades / tiempoActivoMinutos;
      standardReal = unidadesPorMinuto * 60;
    }
    
    const standardTeorico = 2000;
    const standardRealVsTeorico = standardTeorico > 0 ? (standardReal / standardTeorico) * 100 : 0;
    const disponibilidad = tiempoTotalMinutos > 0 ? tiempoActivoMinutos / tiempoTotalMinutos : 0;
    
    // Rendimiento (como decimal 0-1)
    let rendimiento = 0;
    if (tiempoActivoMinutos > 0) {
      const standardTeoricoMinuto = standardTeorico / 60;
      const unidadesTeoricas = tiempoActivoMinutos * standardTeoricoMinuto;
      rendimiento = unidadesTeoricas > 0 ? totalUnidades / unidadesTeoricas : 0;
    }
    
    const calidad = totalUnidades > 0 ? unidadesCierreFinal / totalUnidades : 0;
    const oee = disponibilidad * rendimiento * calidad;
    
    // Preparar datos de actualización
    const datosActualizacion = {
      estado: 'finalizada',
      horaFin: ahora,
      tiempoTotal: Number(tiempoTotalMinutos),
      tiempoTotalActivo: Number(tiempoActivoMinutos),
      tiempoTotalPausas: Number(tiempoPausadoTotalMinutos), // Solo pausas que computan
      tiempoEstimadoProduccion: Number(tiempoEstimadoProduccion.toFixed(6)),
      
      // Valores calculados automáticamente
      botesBuenos: Number(botesBuenosCalculados),
      unidadesRecuperadas: Number(unidadesRecuperadasCalculadas),
      recirculacionRepercap: recirculacionRepercapCalculada,
      
      // Datos de cierre
      unidadesCierreFin: Number(unidadesCierreFinal),
      unidadesNoOkFin: Number(unidadesNoOkFinal),
      numeroCorteSanitarioFinal: numeroCorteSanitarioFinal ? Number(numeroCorteSanitarioFinal) : ordenF.numeroCorteSanitarioFinal,
      
      // Total de unidades
      totalUnidades: Number(totalUnidades),
      
      // Unidades especiales
      unidadesPonderalTotal: Number(unidadesPonderalTotalFinal),
      unidadesExpulsadas: Number(unidadesExpulsadasFinal),
      
      // Porcentajes (0-100)
      porcentajeUnidadesOk: Number(porcentajeUnidadesOk.toFixed(6)),
      porcentajeUnidadesNoOk: Number(porcentajeUnidadesNoOk.toFixed(6)),
      porcentajePausas: Number(porcentajePausas.toFixed(6)),
      porcentajeCompletado: Number(porcentajeCompletado.toFixed(6)),
      
      // Tasas (0-100)
      tasaExpulsion: Number(tasaExpulsion.toFixed(6)),
      tasaRecuperacionRepercap: tasaRecuperacionRepercap !== null ? Number(tasaRecuperacionRepercap.toFixed(6)) : null,
      
      // Estándares
      standardReal: Number(standardReal.toFixed(6)),
      standardRealVsTeorico: Number(standardRealVsTeorico.toFixed(6)),
      
      // Métricas OEE (como decimales 0-1)
      disponibilidad: Number(disponibilidad.toFixed(6)),
      rendimiento: Number(rendimiento.toFixed(6)),
      calidad: Number(calidad.toFixed(6)),
      oee: Number(oee.toFixed(6))
    };
    
    console.log('RESULTADOS FINALES:');
    console.log(`botesBuenos final: ${botesBuenosCalculados}`);
    console.log(`unidadesRecuperadas final: ${unidadesRecuperadasCalculadas}`);
    console.log(`recirculacionRepercap final: ${recirculacionRepercapCalculada}`);
    console.log(`tasaRecuperacionRepercap final: ${tasaRecuperacionRepercap}%`);
    console.log(`tiempoTotal (minutos): ${tiempoTotalMinutos}`);
    console.log(`tiempoActivo (minutos): ${tiempoActivoMinutos}`);
    console.log(`tiempoPausadoTotal (minutos): ${tiempoPausadoTotalMinutos} (solo pausas que computan)`);
    console.log(`standardReal: ${standardReal.toFixed(2)} unidades/hora`);
    console.log(`OEE: ${(oee * 100).toFixed(2)}%`);
    
    // Actualizar orden deshabilitando hooks para evitar recálculos
    await ordenF.update(datosActualizacion, { 
      transaction,
      hooks: false
    });
    
    await transaction.commit();
    
    // Obtener la orden actualizada
    const ordenActualizada = await OrdenFabricacion.findByPk(id, { 
      include: ['pausas']
    });
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', ordenActualizada);
    
    return res.status(200).json({ 
      message: 'Orden de fabricación finalizada correctamente',
      orden: ordenActualizada,
      calculoAutomatico: {
        botesPorCaja: ordenF.botesPorCaja,
        cajasContadas: ordenF.cajasContadas,
        botesBuenosCalculados: botesBuenosCalculados,
        unidadesRecuperadasCalculadas: unidadesRecuperadasCalculadas,
        recirculacionRepercapCalculada: recirculacionRepercapCalculada,
        tasaRecuperacionRepercapCalculada: tasaRecuperacionRepercap,
        tiempoPausasQueComputan: tiempoPausadoTotalMinutos
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al finalizar orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al finalizar orden de fabricación',
      error: error.message 
    });
  }
};

// ... resto de métodos sin cambios ...
// (todos los demás métodos permanecen igual)

// Actualizar detalles del producto manualmente
exports.actualizarDetallesProducto = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { formato, tipo, udsBote, tipoBote } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    // Preparar datos de actualización solo con los campos permitidos
    const datosActualizacion = {};
    
    // Solo actualizar los campos que se envían en el body
    if (formato !== undefined) {
      datosActualizacion.formato = formato ? formato.trim() : null;
    }
    
    if (tipo !== undefined) {
      datosActualizacion.tipo = tipo ? tipo.trim() : null;
    }
    
    if (udsBote !== undefined) {
      // Validar que sea un número positivo si se proporciona
      const udsNumber = Number(udsBote);
      if (udsBote !== null && udsBote !== '' && (isNaN(udsNumber) || udsNumber < 0)) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: 'Las unidades por bote deben ser un número positivo o null' 
        });
      }
      datosActualizacion.udsBote = udsBote === null || udsBote === '' ? null : udsNumber;
    }
    
    if (tipoBote !== undefined) {
      datosActualizacion.tipoBote = tipoBote ? tipoBote.trim() : null;
    }
    
    // Verificar que al menos un campo se esté actualizando
    if (Object.keys(datosActualizacion).length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Debe proporcionar al menos un campo para actualizar (formato, tipo, udsBote, tipoBote)' 
      });
    }
    
    console.log(`Actualizando detalles del producto para orden ${id}:`, datosActualizacion);
    
    // Actualizar la orden
    await ordenF.update(datosActualizacion, { transaction });
    
    await transaction.commit();
    
    // Obtener la orden actualizada
    const ordenActualizada = await OrdenFabricacion.findByPk(id, { 
      include: ['pausas']
    });
    
    // Notificar a través de socket.io
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('ordenFabricacion:updated', ordenActualizada);
        console.log('Notificación socket.io enviada para actualización de detalles');
      }
    } catch (socketError) {
      console.error('Error socket.io:', socketError);
    }
    
    return res.status(200).json({ 
      message: 'Detalles del producto actualizados correctamente',
      orden: ordenActualizada,
      camposActualizados: Object.keys(datosActualizacion)
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('Error al actualizar detalles del producto:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const erroresValidacion = error.errors.map(err => ({
        campo: err.path,
        mensaje: err.message,
        valor: err.value
      }));
      
      return res.status(400).json({
        message: 'Error de validación en los datos',
        errores: erroresValidacion
      });
    }
    
    return res.status(500).json({ 
      message: 'Error al actualizar detalles del producto',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
  }
};

// Incrementar el contador de botes buenos
exports.incrementarBotesBuenos = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad = 1 } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede actualizar botes en estado ${ordenF.estado}` });
    }
    
    // Incrementar botes buenos
    const botesBuenosActualizados = ordenF.botesBuenos + cantidad;
    
    await ordenF.update({ 
      botesBuenos: botesBuenosActualizados 
    }, { transaction });
    
    // Actualizar automáticamente el contador de cajas si hay botesPorCaja definido
    if (ordenF.botesPorCaja > 0) {
      const cajasCalculadas = Math.floor(botesBuenosActualizados / ordenF.botesPorCaja);
      if (cajasCalculadas !== ordenF.cajasContadas) {
        await ordenF.update({
          cajasContadas: cajasCalculadas
        }, { transaction });
      }
    }
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: `Contador de botes buenos actualizado a ${botesBuenosActualizados}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al incrementar botes buenos:', error);
    return res.status(500).json({ 
      message: 'Error al incrementar botes buenos',
      error: error.message 
    });
  }
};

// Establecer valor específico para botes buenos
exports.establecerBotesBuenos = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad } = req.body;
    
    if (cantidad === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad de botes buenos es obligatoria' });
    }
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede actualizar botes en estado ${ordenF.estado}` });
    }
    
    // Establecer botes buenos
    await ordenF.update({ 
      botesBuenos: cantidad 
    }, { transaction });
    
    // Actualizar automáticamente el contador de cajas si hay botesPorCaja definido
    if (ordenF.botesPorCaja > 0) {
      const cajasCalculadas = Math.floor(cantidad / ordenF.botesPorCaja);
      if (cajasCalculadas !== ordenF.cajasContadas) {
        await ordenF.update({
          cajasContadas: cajasCalculadas
        }, { transaction });
      }
    }
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: `Contador de botes buenos establecido a ${cantidad}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al establecer botes buenos:', error);
    return res.status(500).json({ 
      message: 'Error al establecer botes buenos',
      error: error.message 
    });
  }
};

// Incrementar el contador de cajas
exports.incrementarCajas = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad = 1 } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede incrementar cajas en estado ${ordenF.estado}` });
    }
    
    // Incrementar cajas
    const cajasActualizadas = ordenF.cajasContadas + cantidad;
    
    await ordenF.update({ 
      cajasContadas: cajasActualizadas 
    }, { transaction });
    
    // Recalcular botes buenos automáticamente si hay botesPorCaja definido
    if (ordenF.botesPorCaja > 0) {
      const botesBuenosCalculados = cajasActualizadas * ordenF.botesPorCaja;
      await ordenF.update({
        botesBuenos: botesBuenosCalculados
      }, { transaction });
    }
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: `Contador de cajas incrementado a ${cajasActualizadas}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al incrementar cajas:', error);
    return res.status(500).json({ 
      message: 'Error al incrementar cajas',
      error: error.message 
    });
  }
};

// Establecer valor específico para cajas
exports.establecerCajas = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad } = req.body;
    
    if (cantidad === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad de cajas es obligatoria' });
    }
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede establecer cajas en estado ${ordenF.estado}` });
    }
    
    // Establecer cajas
    await ordenF.update({ 
      cajasContadas: cantidad 
    }, { transaction });
    
    // Recalcular botes buenos automáticamente si hay botesPorCaja definido
    if (ordenF.botesPorCaja > 0) {
      const botesBuenosCalculados = cantidad * ordenF.botesPorCaja;
      await ordenF.update({
        botesBuenos: botesBuenosCalculados
      }, { transaction });
    }
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: `Contador de cajas establecido a ${cantidad}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al establecer cajas:', error);
    return res.status(500).json({ 
      message: 'Error al establecer cajas',
      error: error.message 
    });
  }
};

// Incrementar botes expulsados
exports.incrementarBotesExpulsados = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad = 1 } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede incrementar botes expulsados en estado ${ordenF.estado}` });
    }
    
    const botesExpulsadosActualizados = (ordenF.botesExpulsados || 0) + cantidad;
    
    await ordenF.update({ 
      botesExpulsados: botesExpulsadosActualizados
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    console.log(`PIN 22 activado - Botes expulsados incrementado: ${botesExpulsadosActualizados}`);
    
    return res.status(200).json({ 
      message: `Contador de botes expulsados incrementado a ${botesExpulsadosActualizados}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al incrementar botes expulsados:', error);
    return res.status(500).json({ 
      message: 'Error al incrementar botes expulsados',
      error: error.message 
    });
  }
};

// Incrementar botes ponderal
exports.incrementarBotesPonderal = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad = 1 } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede incrementar botes ponderal en estado ${ordenF.estado}` });
    }
    
    const botesPonderalActualizados = (ordenF.botesPonderal || 0) + cantidad;
    
    await ordenF.update({ 
      botesPonderal: botesPonderalActualizados
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    console.log(`PIN 23 activado - Botes ponderal incrementado: ${botesPonderalActualizados}`);
    
    return res.status(200).json({ 
      message: `Contador de botes ponderal incrementado a ${botesPonderalActualizados}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al incrementar botes ponderal:', error);
    return res.status(500).json({ 
      message: 'Error al incrementar botes ponderal',
      error: error.message 
    });
  }
};

// Establecer valor específico para botes ponderal
exports.establecerBotesPonderal = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { cantidad } = req.body;
    
    if (cantidad === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad de botes ponderal es obligatoria' });
    }
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
      await transaction.rollback();
      return res.status(400).json({ message: `No se puede establecer botes ponderal en estado ${ordenF.estado}` });
    }
    
    await ordenF.update({ 
      botesPonderal: Number(cantidad)
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: `Contador de botes ponderal establecido a ${cantidad}`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al establecer botes ponderal:', error);
    return res.status(500).json({ 
      message: 'Error al establecer botes ponderal',
      error: error.message 
    });
  }
};

// Simular el paso de tiempo en una orden activa
exports.simularTiempo = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { minutos = 60 } = req.body;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    if (ordenF.estado !== 'iniciada') {
      await transaction.rollback();
      return res.status(400).json({ message: `Solo se pueden simular órdenes en estado 'iniciada'. Estado actual: ${ordenF.estado}` });
    }
    
    // Guardar la hora original
    const horaInicioOriginal = new Date(ordenF.horaInicio);
    
    // Modificar la hora de inicio para simular que ha pasado más tiempo
    const nuevaHoraInicio = new Date(horaInicioOriginal);
    nuevaHoraInicio.setMinutes(nuevaHoraInicio.getMinutes() - minutos);
    
    await ordenF.update({ 
      horaInicio: nuevaHoraInicio 
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    const duracionSimulada = Math.floor((new Date() - nuevaHoraInicio) / (1000 * 60));
    
    return res.status(200).json({ 
      message: `Simulación de tiempo completada. Se han añadido ${minutos} minutos a la orden.`,
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] }),
      tiempoSimulado: {
        horaInicioOriginal,
        nuevaHoraInicio,
        duracionSimuladaMinutos: duracionSimulada
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al simular tiempo:', error);
    return res.status(500).json({ 
      message: 'Error al simular tiempo en la orden',
      error: error.message 
    });
  }
};

// Obtener métricas de OEE para una orden de fabricación
exports.obtenerMetricasOEE = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ordenF = await OrdenFabricacion.findByPk(id);
    
    if (!ordenF) {
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    const metricas = {
      disponibilidad: ordenF.disponibilidad,
      rendimiento: ordenF.rendimiento,
      calidad: ordenF.calidad,
      oee: ordenF.oee,
      
      // Detalles adicionales
      tiempoTotal: ordenF.tiempoTotal,
      tiempoTotalActivo: ordenF.tiempoTotalActivo,
      tiempoTotalPausas: ordenF.tiempoTotalPausas,
      
      // Unidades
      cantidadProducir: ordenF.cantidadProducir,
      unidadesCierreFin: ordenF.unidadesCierreFin,
      unidadesNoOkFin: ordenF.unidadesNoOkFin,
      unidadesExpulsadas: ordenF.unidadesExpulsadas,
      
      // Estándares
      standardReal: ordenF.standardReal,
      standardRealVsTeorico: ordenF.standardRealVsTeorico
    };
    
    return res.status(200).json(metricas);
  } catch (error) {
    console.error('Error al obtener métricas OEE:', error);
    return res.status(500).json({ 
      message: 'Error al obtener métricas OEE',
      error: error.message 
    });
  }
};

// Actualizar una orden de fabricación
exports.update = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    // No permitir cambiar el estado a través de este endpoint
    if (req.body.estado) {
      delete req.body.estado;
    }
    
    await ordenF.update(req.body, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: 'Orden de fabricación actualizada correctamente',
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al actualizar orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al actualizar orden de fabricación',
      error: error.message 
    });
  }
};

// Eliminar una orden de fabricación
exports.delete = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
    
    if (!ordenF) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    // Solo permitir eliminar órdenes en estado 'creada'
    if (ordenF.estado !== 'creada') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `No se puede eliminar una orden en estado ${ordenF.estado}` 
      });
    }
    
    // Eliminar las pausas relacionadas
    await Pausa.destroy({
      where: { ordenFabricacionId: id },
      transaction
    });
    
    // Eliminar la orden
    await ordenF.destroy({ transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:deleted', id);
    
    return res.status(200).json({ 
      message: 'Orden de fabricación eliminada correctamente',
      id
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al eliminar orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al eliminar orden de fabricación',
      error: error.message 
    });
  }
};