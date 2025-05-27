const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OrdenFabricacion = sequelize.define('OrdenFabricacion', {
  // Identificación básica
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    unique: true
  },
  
  // Datos básicos de creación
  codigoOrden: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notNull: {
        msg: 'El código de orden es obligatorio'
      },
      notEmpty: {
        msg: 'El código de orden no puede estar vacío'
      }
    }
  },
  codigoArticulo: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: {
        msg: 'El código de artículo es obligatorio'
      },
      notEmpty: {
        msg: 'El código de artículo no puede estar vacío'
      }
    }
  },
  producto: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: {
        msg: 'El nombre del producto es obligatorio'
      },
      notEmpty: {
        msg: 'El nombre del producto no puede estar vacío'
      }
    }
  },
  
  // Tiempos
  horaInicio: {
    type: DataTypes.DATE,
    allowNull: true
  },
  horaFin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Detalles de producción
  cantidadProducir: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: {
        args: [1],
        msg: 'La cantidad a producir debe ser mayor a 0'
      }
    }
  },
  numeroCajas: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'El número de cajas no puede ser negativo'
      }
    }
  },
  botesPorCaja: {
    type: DataTypes.INTEGER,
    allowNull: true, // CAMBIADO: ahora permite null
    defaultValue: null, // CAMBIADO: valor por defecto null
    validate: {
      min: {
        args: [0],
        msg: 'Los botes por caja no pueden ser negativos'
      }
    }
  },
  
  // Repercap - CORREGIDO: manejo de null values
  repercap: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  numeroCorteSanitarioInicial: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null, // EXPLÍCITO: valor por defecto null
    validate: {
      min: {
        args: [0],
        msg: 'El número de corte sanitario inicial no puede ser negativo'
      }
    }
  },
  
  // Tiempo estimado
  tiempoEstimadoProduccion: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Tiempo estimado en horas (cantidadProducir / 4000)'
  },
  
  // Tiempos reales
  tiempoTotalActivo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Tiempo activo en minutos'
  },
  tiempoTotalPausas: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Tiempo de pausas en minutos'
  },
  tiempoTotal: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Tiempo total en minutos'
  },
  
  // Unidades al cierre
  unidadesCierreFin: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  unidadesNoOkFin: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  totalUnidades: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'unidadesCierreFin + unidadesNoOkFin'
  },
  
  // Cajas
  conteoTotalCajas: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  
  // Unidades especiales
  unidadesRecuperadas: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'Calculado automáticamente: unidadesPonderalTotal - botes buenos'
  },
  unidadesPonderalTotal: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  unidadesExpulsadas: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  
  // Cortes sanitarios
  numeroCorteSanitarioFinal: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null, // EXPLÍCITO: valor por defecto null
    validate: {
      min: {
        args: [0],
        msg: 'El número de corte sanitario final no puede ser negativo'
      }
    }
  },
  
  // Recirculación Repercap
  recirculacionRepercap: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'Calculado automáticamente: botes buenos * (numeroCorteSanitarioFinal - numeroCorteSanitarioInicial)'
  },
  
  // Métricas calculadas
  porcentajeUnidadesOk: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  porcentajeUnidadesNoOk: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  porcentajePausas: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  porcentajeCompletado: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  
  // Tasas
  tasaExpulsion: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: '(unidadesExpulsadas / totalUnidades) * 100'
  },
  tasaRecuperacionPonderal: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: '(unidadesRecuperadas / unidadesPonderalTotal) * 100'
  },
 tasaRecuperacionPonderal: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 0,
    allowNull: false,
    comment: 'Tasa recuperación ponderal = recirculacionPonderal / (unidadesCierreFin + unidadesNoOkFin) * 100'
  },
  
  // Estándares
  standardReal: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'totalUnidades / tiempoTotalActivo (en horas)'
  },
  standardRealVsTeorico: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: '(standardReal / 4000) * 100'
  },
  
  // Indicadores de rendimiento (valores decimales 0-1)
  disponibilidad: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'tiempoTotalActivo / tiempoTotal (valor entre 0 y 1)'
  },
  rendimiento: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'totalUnidades / (tiempoTotalActivo * (4000/60)) (valor entre 0 y 1)'
  },
  calidad: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'unidadesCierreFin / totalUnidades (valor entre 0 y 1)'
  },
  
  // OEE (Overall Equipment Effectiveness) (valor decimal 0-1)
  oee: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'disponibilidad * rendimiento * calidad (valor entre 0 y 1)'
  },
  
  // Estado de la orden
  estado: {
    type: DataTypes.ENUM('creada', 'iniciada', 'pausada', 'finalizada'),
    defaultValue: 'creada',
    allowNull: false
  },
   botesPonderal: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: 'Contador de botes ponderal (activado por PIN 23)'
  },  recirculacionPonderal: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 0,
    allowNull: false,
    comment: 'Recirculación ponderal = unidadesPonderalTotal - (unidadesCierreFin + unidadesNoOkFin)'
  },
  
  // Campos adicionales para seguimiento
  botesOperario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Cantidad de botes registrados por el operario'
  },
  
  // Campos opcionales
  maquinaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID de la máquina asociada a esta orden'
  },
  
  // Contador de botes buenos
  botesBuenos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Contador de botes buenos durante la producción'
  },
  
  // Contador de cajas
  cajasContadas: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Contador de cajas durante la producción'
  }
}, {
  tableName: 'ordenes_fabricacion',
  timestamps: true,
  
  hooks: {
    beforeCreate: (orden, options) => {
      try {
        console.log('Hook beforeCreate ejecutándose...');
        console.log('Datos de orden:', JSON.stringify(orden.dataValues, null, 2));
        
        // Calcular tiempo estimado de producción
        if (orden.cantidadProducir && !orden.tiempoEstimadoProduccion) {
          orden.tiempoEstimadoProduccion = orden.cantidadProducir / 4000;
        }
        
        // CORREGIDO: Manejo seguro de campos null/undefined
        // Solo establecer valores si no están definidos o son null
        if (orden.botesPorCaja === undefined) {
          orden.botesPorCaja = null;
        }
        
        if (orden.numeroCorteSanitarioInicial === undefined) {
          orden.numeroCorteSanitarioInicial = null;
        }
        
        if (orden.numeroCorteSanitarioFinal === undefined) {
          orden.numeroCorteSanitarioFinal = null;
        }
        
        // Restablecer campos calculados a null (no undefined)
        orden.oee = null;
        orden.disponibilidad = null;
        orden.rendimiento = null;
        orden.calidad = null;
        orden.porcentajeUnidadesOk = null;
        orden.porcentajeUnidadesNoOk = null;
        orden.porcentajePausas = null;
        orden.porcentajeCompletado = null;
        orden.standardReal = null;
        orden.standardRealVsTeorico = null;
        orden.tasaExpulsion = null;
        orden.tasaRecuperacionPonderal = null;
        orden.recirculacionRepercap = null;
        orden.unidadesRecuperadas = null;
        
        console.log('Hook beforeCreate completado exitosamente');
      } catch (error) {
        console.error('Error en hook beforeCreate:', error);
        throw error; // Re-lanzar el error para que Sequelize lo maneje
      }
    },
    
    beforeSave: (orden, options) => {
      try {
        console.log('Hook beforeSave ejecutándose...');
        
        // Verificar si se está llamando desde el método finalizar con hooks: false
        if (options && options.hooks === false) {
          console.log('Hooks desactivados, saltando cálculos automáticos');
          return;
        }
        
        // NUEVO: Calcular recirculación repercap - CON VALIDACIÓN NULL
        if (orden.botesBuenos && 
            orden.numeroCorteSanitarioFinal !== null && orden.numeroCorteSanitarioFinal !== undefined &&
            orden.numeroCorteSanitarioInicial !== null && orden.numeroCorteSanitarioInicial !== undefined) {
          const diferenciaCorteSanitario = orden.numeroCorteSanitarioFinal - orden.numeroCorteSanitarioInicial;
          orden.recirculacionRepercap = orden.botesBuenos * diferenciaCorteSanitario;
          console.log(`Recirculación Repercap calculada: ${orden.recirculacionRepercap}`);
        }
        
        // NUEVO: Calcular unidades recuperadas automáticamente - CON VALIDACIÓN NULL
        if (orden.unidadesPonderalTotal && orden.botesBuenos) {
          orden.unidadesRecuperadas = orden.unidadesPonderalTotal - orden.botesBuenos;
          // Asegurar que no sea negativo
          if (orden.unidadesRecuperadas < 0) {
            orden.unidadesRecuperadas = 0;
          }
          console.log(`Unidades recuperadas calculadas: ${orden.unidadesRecuperadas}`);
        }
        
        // Calcular total de unidades - CON VALIDACIÓN NULL
        if (orden.unidadesCierreFin !== null && orden.unidadesCierreFin !== undefined &&
            orden.unidadesNoOkFin !== null && orden.unidadesNoOkFin !== undefined) {
          orden.totalUnidades = orden.unidadesCierreFin + orden.unidadesNoOkFin;
          console.log(`Total unidades calculado: ${orden.totalUnidades}`);
        }
        
        // Continuar con los cálculos de métricas solo si hay datos suficientes
        if (orden.tiempoTotal && orden.tiempoTotalActivo && orden.tiempoTotal > 0 && orden.tiempoTotalActivo > 0) {
          console.log('Calculando métricas de rendimiento...');
          
          // Disponibilidad (como decimal 0-1)
          orden.disponibilidad = orden.tiempoTotalActivo / orden.tiempoTotal;
          
          // Standard real (unidades por hora)
          const tiempoActivoHoras = orden.tiempoTotalActivo / 60;
          
          if (orden.totalUnidades && tiempoActivoHoras > 0) {
            orden.standardReal = orden.totalUnidades / tiempoActivoHoras;
            
            const standardTeorico = 4000;
            orden.standardRealVsTeorico = (orden.standardReal / standardTeorico) * 100;
            
            // Rendimiento (como decimal 0-1)
            const unidadesTeoricas = orden.tiempoTotalActivo * (standardTeorico / 60);
            orden.rendimiento = unidadesTeoricas > 0 ? orden.totalUnidades / unidadesTeoricas : 0;
          }
          
          // Calidad (como decimal 0-1)
          if (orden.totalUnidades && orden.unidadesCierreFin && orden.totalUnidades > 0) {
            orden.calidad = orden.unidadesCierreFin / orden.totalUnidades;
          }
          
          // OEE (como decimal 0-1)
          if (orden.disponibilidad !== null && orden.rendimiento !== null && orden.calidad !== null) {
            orden.oee = orden.disponibilidad * orden.rendimiento * orden.calidad;
          }
          
          // Porcentajes (como 0-100)
          if (orden.totalUnidades && orden.totalUnidades > 0) {
            orden.porcentajeUnidadesOk = (orden.unidadesCierreFin / orden.totalUnidades) * 100;
            orden.porcentajeUnidadesNoOk = (orden.unidadesNoOkFin / orden.totalUnidades) * 100;
          }
          
          // Porcentaje de completado
          if (orden.cantidadProducir && orden.cantidadProducir > 0) {
            orden.porcentajeCompletado = (orden.unidadesCierreFin / orden.cantidadProducir) * 100;
          }
          
          // Porcentaje de pausas
          if (orden.tiempoTotal > 0) {
            orden.porcentajePausas = (orden.tiempoTotalPausas / orden.tiempoTotal) * 100;
          }
          
          // Tasa de expulsión
          if (orden.totalUnidades && orden.totalUnidades > 0) {
            orden.tasaExpulsion = (orden.unidadesExpulsadas / orden.totalUnidades) * 100;
          }
          
          // Tasa de recuperación ponderal
          if (orden.unidadesPonderalTotal && orden.unidadesPonderalTotal > 0) {
            orden.tasaRecuperacionPonderal = (orden.unidadesRecuperadas / orden.unidadesPonderalTotal) * 100;
          }
        }
        
        console.log('Hook beforeSave completado exitosamente');
      } catch (error) {
        console.error('Error en hook beforeSave:', error);
        throw error;
      }
    }
  }
});

module.exports = OrdenFabricacion;