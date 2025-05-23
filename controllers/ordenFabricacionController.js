
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
    // Preparar datos de entrada
    const datosOrden = {
      codigoOrden: req.body.codigoOrden,
      codigoArticulo: req.body.codigoArticulo,
      producto: req.body.producto,
      cantidadProducir: req.body.cantidadProducir,
      numeroCajas: req.body.numeroCajas,
      repercap: req.body.repercap || false,
      numeroCorteSanitarioInicial: req.body.numeroCorteSanitarioInicial,
      
      // Campos calculados automáticamente
      tiempoEstimadoProduccion: req.body.cantidadProducir / 2000, // Estándar teórico
      estado: 'creada'
    };
    
    // Campos opcionales
    if (req.body.botesPorCaja) {
      datosOrden.botesPorCaja = req.body.botesPorCaja;
    }
    
    // Crear la orden
    const ordenF = await OrdenFabricacion.create(datosOrden, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:created', ordenF);
    
    return res.status(201).json(ordenF);
  } catch (error) {
    await transaction.rollback();
    console.error('Error al crear orden de fabricación:', error);
    return res.status(500).json({ 
      message: 'Error al crear orden de fabricación',
      error: error.message 
    });
  }
};

// Iniciar una orden de fabricación
// Método iniciar en ordenFabricacionController.js

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
        // Calcular duración en minutos
        const duracionPausa = Math.floor((ahora - pausaActiva.horaInicio) / (1000 * 60)); // en minutos
        
        await pausaActiva.update({
          horaFin: ahora,
          duracion: duracionPausa
        }, { transaction });
        
        // Actualizar el tiempo total de pausa en la orden (en minutos)
        await ordenF.update({
          tiempoPausado: (ordenF.tiempoPausado || 0) + duracionPausa
        }, { transaction });
      }
    }
    
    // Iniciar la orden
    const actualizacion = {
      estado: 'iniciada'
    };
    
    // Si es la primera vez que se inicia (no tiene horaInicio)
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

// Pausar una orden de fabricación
exports.pausar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { tipoPausa, comentario } = req.body;
    
    if (!tipoPausa) {
      await transaction.rollback();
      return res.status(400).json({ message: 'El tipo de pausa es obligatorio' });
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
    
    // Crear el registro de pausa
    const ahora = new Date();
    const pausa = await Pausa.create({
      ordenFabricacionId: id,
      horaInicio: ahora,
      tipoPausa,
      comentario
    }, { transaction });
    
    // Actualizar el estado de la orden
    await ordenF.update({ 
      estado: 'pausada' 
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    return res.status(200).json({ 
      message: 'Orden de fabricación pausada correctamente',
      orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] }),
      pausa
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

// Finalizar una orden de fabricación
// Modificación al método finalizar en ordenFabricacionController.js
// Obtener métricas de OEE para una orden de fabricación
exports.obtenerMetricasOEE = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ordenF = await OrdenFabricacion.findByPk(id);
    
    if (!ordenF) {
      return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
    }
    
    // Calcular métricas específicas
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
// Actualizar la sección de finalizar orden con tiempos en minutos
// Actualizar la sección de finalizar orden
// Simular el paso de tiempo en una orden activa
exports.simularTiempo = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { minutos = 60 } = req.body; // Por defecto añadir 60 minutos (1 hora)
    
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
    
    // Actualizar la hora de inicio 
    await ordenF.update({ 
      horaInicio: nuevaHoraInicio 
    }, { transaction });
    
    await transaction.commit();
    
    // Notificar a través de socket.io
    const io = req.app.get('io');
    io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
    
    // Calcular la duración simulada
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
// Actualizar la sección de finalizar orden
// Actualizar la sección de finalizar orden
// Actualizar la sección de finalizar orden
// Método finalizar en ordenFabricacionController.js

// Modificación en el método finalizar del ordenFabricacionController.js
// Agregar esta lógica antes de los cálculos de métricas

// Método finalizar actualizado en ordenFabricacionController.js
exports.finalizar = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      unidadesCierreFin, 
      unidadesNoOkFin, 
      numeroCorteSanitarioFinal,
      unidadesRecuperadas,
      unidadesPonderalTotal,
      unidadesExpulsadas
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
    
    // NUEVA LÓGICA: Calcular botesBuenos automáticamente
    let botesBuenosCalculados = ordenF.botesBuenos || 0;
    
    // Si existen botesPorCaja y cajasContadas, calcular automáticamente
    if (ordenF.botesPorCaja && ordenF.botesPorCaja > 0 && ordenF.cajasContadas && ordenF.cajasContadas > 0) {
      botesBuenosCalculados = ordenF.botesPorCaja * ordenF.cajasContadas;
      
      // Actualizar el campo botesBuenos en la orden
      await ordenF.update({ 
        botesBuenos: botesBuenosCalculados 
      }, { transaction });
      
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
    
    // Calcular el tiempo total pausado sumando todas las pausas
    const pausas = await Pausa.findAll({
      where: { ordenFabricacionId: id },
      transaction
    });
    
    let tiempoPausadoTotalMinutos = 0;
    for (const pausa of pausas) {
      if (pausa.duracion !== null && pausa.duracion !== undefined) {
        tiempoPausadoTotalMinutos += pausa.duracion;
      }
    }
    
    // Calcular el tiempo activo total en minutos
    const ahora = new Date();
    let tiempoTotalMinutos = 0;
    
    if (ordenF.horaInicio) {
      tiempoTotalMinutos = Math.floor((ahora - ordenF.horaInicio) / (1000 * 60));
      if (tiempoTotalMinutos < 1) tiempoTotalMinutos = 1;
    }
    
    const tiempoActivoMinutos = tiempoTotalMinutos - tiempoPausadoTotalMinutos;
    
    // Estándar de referencia (unidades por hora)
    const standardTeorico = 4000;
    const standardTeoricoMinuto = standardTeorico / 60;
    
    // Convertir todo a números para evitar errores de tipo
    const unidadesCierreFinal = Number(unidadesCierreFin) || Number(botesBuenosCalculados) || Number(ordenF.unidadesCierreFin) || 0;
    const unidadesNoOkFinal = Number(unidadesNoOkFin) || Number(ordenF.unidadesNoOkFin) || 0;
    const unidadesExpulsadasFinal = Number(unidadesExpulsadas) || Number(ordenF.botesExpulsados) || Number(ordenF.unidadesExpulsadas) || 0;
    const unidadesPonderalTotalFinal = Number(unidadesPonderalTotal) || Number(ordenF.unidadesPonderalTotal) || 0;
    
    // NUEVA LÓGICA: Calcular unidadesRecuperadas automáticamente
    let unidadesRecuperadasCalculadas = 0;
    if (unidadesPonderalTotalFinal > 0 && botesBuenosCalculados > 0) {
      unidadesRecuperadasCalculadas = unidadesPonderalTotalFinal - botesBuenosCalculados;
      // Asegurar que no sea negativo
      if (unidadesRecuperadasCalculadas < 0) {
        unidadesRecuperadasCalculadas = 0;
      }
    }
    
    // NUEVA LÓGICA: Calcular recirculación repercap
    let recirculacionRepercapCalculada = null;
    if (botesBuenosCalculados > 0 && numeroCorteSanitarioFinal !== null && numeroCorteSanitarioFinal !== undefined && 
        ordenF.numeroCorteSanitarioInicial !== null && ordenF.numeroCorteSanitarioInicial !== undefined) {
      const corteFinal = Number(numeroCorteSanitarioFinal);
      const corteInicial = Number(ordenF.numeroCorteSanitarioInicial);
      const diferenciaCorteSanitario = corteFinal - corteInicial;
      recirculacionRepercapCalculada = botesBuenosCalculados * diferenciaCorteSanitario;
    }
    
    // Total de unidades producidas (buenas + malas)
    const totalUnidades = unidadesCierreFinal + unidadesNoOkFinal;
    
    console.log(`DATOS PARA CÁLCULOS:`);
    console.log(`- Botes buenos calculados: ${botesBuenosCalculados}`);
    console.log(`- Unidades recuperadas calculadas: ${unidadesRecuperadasCalculadas}`);
    console.log(`- Recirculación repercap calculada: ${recirculacionRepercapCalculada}`);
    console.log(`- Unidades cierre final: ${unidadesCierreFinal}`);
    console.log(`- Unidades NO OK final: ${unidadesNoOkFinal}`);
    console.log(`- Total unidades: ${totalUnidades}`);
    
    // Cálculos de métricas (manteniendo la lógica existente)
    const tiempoEstimadoProduccion = ordenF.cantidadProducir / standardTeorico;
    const porcentajePausas = tiempoTotalMinutos > 0 ? (tiempoPausadoTotalMinutos / tiempoTotalMinutos) * 100 : 0;
    const porcentajeUnidadesOk = totalUnidades > 0 ? (unidadesCierreFinal / totalUnidades) * 100 : 0;
    const porcentajeUnidadesNoOk = totalUnidades > 0 ? (unidadesNoOkFinal / totalUnidades) * 100 : 0;
    const tasaExpulsion = totalUnidades > 0 ? (unidadesExpulsadasFinal / totalUnidades) * 100 : 0;
    const tasaRecuperacionPonderal = unidadesPonderalTotalFinal > 0 ? (unidadesRecuperadasCalculadas / unidadesPonderalTotalFinal) * 100 : 0;
    const porcentajeCompletado = ordenF.cantidadProducir > 0 ? (unidadesCierreFinal / ordenF.cantidadProducir) * 100 : 0;
    
    // Estándar real (unidades/hora)
    let standardReal = 0;
    if (tiempoActivoMinutos > 0) {
      const unidadesPorMinuto = totalUnidades / tiempoActivoMinutos;
      standardReal = unidadesPorMinuto * 60;
    }
    
    const standardRealVsTeorico = standardTeorico > 0 ? (standardReal / standardTeorico) * 100 : 0;
    const disponibilidad = tiempoTotalMinutos > 0 ? tiempoActivoMinutos / tiempoTotalMinutos : 0;
    
    // Rendimiento (como decimal 0-1)
    let rendimiento = 0;
    if (tiempoActivoMinutos > 0) {
      const unidadesTeoricas = tiempoActivoMinutos * standardTeoricoMinuto;
      rendimiento = unidadesTeoricas > 0 ? totalUnidades / unidadesTeoricas : 0;
    }
    
    const calidad = totalUnidades > 0 ? unidadesCierreFinal / totalUnidades : 0;
    const oee = disponibilidad * rendimiento * calidad;
    
    // Preparar datos de actualización con los nuevos campos calculados
    const datosActualizacion = {
      estado: 'finalizada',
      horaFin: ahora,
      tiempoTotal: Number(tiempoTotalMinutos),
      tiempoTotalActivo: Number(tiempoActivoMinutos),
      tiempoTotalPausas: Number(tiempoPausadoTotalMinutos),
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
      
      // Porcentajes (siguen como 0-100)
      porcentajeUnidadesOk: Number(porcentajeUnidadesOk.toFixed(6)),
      porcentajeUnidadesNoOk: Number(porcentajeUnidadesNoOk.toFixed(6)),
      porcentajePausas: Number(porcentajePausas.toFixed(6)),
      porcentajeCompletado: Number(porcentajeCompletado.toFixed(6)),
      
      // Tasas (siguen como 0-100)
      tasaExpulsion: Number(tasaExpulsion.toFixed(6)),
      tasaRecuperacionPonderal: Number(tasaRecuperacionPonderal.toFixed(6)),
      
      // Estándares
      standardReal: Number(standardReal.toFixed(6)),
      standardRealVsTeorico: Number(standardRealVsTeorico.toFixed(6)),
      
      // Métricas OEE (como decimales 0-1)
      disponibilidad: Number(disponibilidad.toFixed(6)),
      rendimiento: Number(rendimiento.toFixed(6)),
      calidad: Number(calidad.toFixed(6)),
      oee: Number(oee.toFixed(6))
    };
    
    // Para depuración extensiva
    console.log('RESULTADOS FINALES:');
    console.log(`botesBuenos final: ${botesBuenosCalculados}`);
    console.log(`unidadesRecuperadas final: ${unidadesRecuperadasCalculadas}`);
    console.log(`recirculacionRepercap final: ${recirculacionRepercapCalculada}`);
    console.log(`tiempoTotal (minutos): ${tiempoTotalMinutos}`);
    console.log(`tiempoActivo (minutos): ${tiempoActivoMinutos}`);
    console.log(`tiempoPausadoTotal (minutos): ${tiempoPausadoTotalMinutos}`);
    console.log(`standardReal: ${standardReal.toFixed(2)} unidades/hora`);
    console.log(`OEE: ${(oee * 100).toFixed(2)}%`);
    
    // Actualizar y finalizar la orden DESHABILITANDO LOS HOOKS
    console.log('Actualizando orden con datos calculados');
    await ordenF.update(datosActualizacion, { 
      transaction,
      hooks: false // Evitar que se vuelvan a calcular por el hook beforeSave
    });
    
    await transaction.commit();
    
    // Obtener la orden actualizada con todos los cálculos automáticos
   const ordenActualizada = await OrdenFabricacion.findByPk(id, { 
     include: ['pausas'],
     transaction: null 
   });
   
   // Verificar los valores guardados
   console.log('VALORES GUARDADOS:');
   console.log(`botesBuenos guardado: ${ordenActualizada.botesBuenos}`);
   console.log(`unidadesRecuperadas guardado: ${ordenActualizada.unidadesRecuperadas}`);
   console.log(`recirculacionRepercap guardado: ${ordenActualizada.recirculacionRepercap}`);
   console.log(`tiempoPausadoTotal guardado (minutos): ${ordenActualizada.tiempoTotalPausas}`);
   console.log(`standardReal guardado: ${ordenActualizada.standardReal}`);
   console.log(`disponibilidad guardado: ${ordenActualizada.disponibilidad} (${ordenActualizada.disponibilidad * 100}%)`);
   console.log(`rendimiento guardado: ${ordenActualizada.rendimiento} (${ordenActualizada.rendimiento * 100}%)`);
   console.log(`calidad guardado: ${ordenActualizada.calidad} (${ordenActualizada.calidad * 100}%)`);
   console.log(`oee guardado: ${ordenActualizada.oee} (${ordenActualizada.oee * 100}%)`);
   
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
       recirculacionRepercapCalculada: recirculacionRepercapCalculada
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
  
  // Agregar los nuevos métodos para gestionar botesOperario
  exports.incrementarBotesOperario = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { cantidad = 1 } = req.body; // Por defecto incrementa 1 bote
      
      const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
      
      if (!ordenF) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
      }
      
      if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
        await transaction.rollback();
        return res.status(400).json({ message: `No se puede incrementar botes operario en estado ${ordenF.estado}` });
      }
      
      // Incrementar el contador de botes operario
      const botesOperarioActualizados = ordenF.botesOperario + cantidad;
      
      await ordenF.update({ 
        botesOperario: botesOperarioActualizados 
      }, { transaction });
      
      await transaction.commit();
      
      // Notificar a través de socket.io
      const io = req.app.get('io');
      io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
      
      return res.status(200).json({ 
        message: `Contador de botes operario incrementado a ${botesOperarioActualizados}`,
        orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error al incrementar botes operario:', error);
      return res.status(500).json({ 
        message: 'Error al incrementar botes operario',
        error: error.message 
      });
    }
  };
  
  exports.establecerBotesOperario = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { cantidad } = req.body;
      
      if (cantidad === undefined) {
        await transaction.rollback();
        return res.status(400).json({ message: 'La cantidad de botes operario es obligatoria' });
      }
      
      const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
      
      if (!ordenF) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
      }
      
      if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
        await transaction.rollback();
        return res.status(400).json({ message: `No se puede establecer botes operario en estado ${ordenF.estado}` });
      }
      
      // Establecer el contador de botes operario
      await ordenF.update({ 
        botesOperario: cantidad 
      }, { transaction });
      
      await transaction.commit();
      
      // Notificar a través de socket.io
      const io = req.app.get('io');
      io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
      
      return res.status(200).json({ 
        message: `Contador de botes operario establecido a ${cantidad}`,
        orden: await OrdenFabricacion.findByPk(id, { include: ['pausas'] })
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error al establecer botes operario:', error);
      return res.status(500).json({ 
        message: 'Error al establecer botes operario',
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
// Agregar al controlador ordenFabricacionController.js

// Incrementar el contador de botes buenos
exports.incrementarBotesBuenos = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { cantidad = 1 } = req.body; // Por defecto incrementa 1 bote
      
      const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
      
      if (!ordenF) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
      }
      
      if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
        await transaction.rollback();
        return res.status(400).json({ message: `No se puede actualizar botes en estado ${ordenF.estado}` });
      }
      
      // Incrementar el contador de botes buenos
      const botesBuenosActualizados = ordenF.botesBuenos + cantidad;
      
      await ordenF.update({ 
        botesBuenos: botesBuenosActualizados 
      }, { transaction });
      
      // Actualizar automáticamente el contador de cajas si corresponde
      if (ordenF.botesPorCaja > 0) {
        const cajasCalculadas = Math.floor(botesBuenosActualizados / ordenF.botesPorCaja);
        if (cajasCalculadas > ordenF.cajasContadas) {
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
      
      // Establecer el contador de botes buenos
      await ordenF.update({ 
        botesBuenos: cantidad 
      }, { transaction });
      
      // Actualizar automáticamente el contador de cajas si corresponde
      if (ordenF.botesPorCaja > 0) {
        const cajasCalculadas = Math.floor(cantidad / ordenF.botesPorCaja);
        if (cajasCalculadas > ordenF.cajasContadas) {
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
  
  // Incrementar el contador de botes expulsados
  exports.incrementarBotesExpulsados = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { cantidad = 1 } = req.body; // Por defecto incrementa 1 bote
      
      const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
      
      if (!ordenF) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
      }
      
      if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
        await transaction.rollback();
        return res.status(400).json({ message: `No se puede actualizar botes en estado ${ordenF.estado}` });
      }
      
      // Incrementar el contador de botes expulsados
      const botesExpulsadosActualizados = ordenF.botesExpulsados + cantidad;
      
      await ordenF.update({ 
        botesExpulsados: botesExpulsadosActualizados 
      }, { transaction });
      
      await transaction.commit();
      
      // Notificar a través de socket.io
      const io = req.app.get('io');
      io.emit('ordenFabricacion:updated', await OrdenFabricacion.findByPk(id, { include: ['pausas'] }));
      
      return res.status(200).json({ 
        message: `Contador de botes expulsados actualizado a ${botesExpulsadosActualizados}`,
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
  // Agregar al controlador ordenFabricacionController.js

// Incrementar el contador de cajas
exports.incrementarCajas = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { cantidad = 1 } = req.body; // Por defecto incrementa 1 caja
      
      const ordenF = await OrdenFabricacion.findByPk(id, { transaction });
      
      if (!ordenF) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Orden de fabricación no encontrada' });
      }
      
      if (ordenF.estado === 'finalizada' || ordenF.estado === 'creada') {
        await transaction.rollback();
        return res.status(400).json({ message: `No se puede incrementar cajas en estado ${ordenF.estado}` });
      }
      
      // Incrementar el contador de cajas
      const cajasActualizadas = ordenF.cajasContadas + cantidad;
      
      await ordenF.update({ 
        cajasContadas: cajasActualizadas 
      }, { transaction });
      
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
      
      // Establecer el contador de cajas
      await ordenF.update({ 
        cajasContadas: cantidad 
      }, { transaction });
      
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