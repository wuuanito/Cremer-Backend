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
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: {
        args: [0],
        msg: 'Los botes por caja no pueden ser negativos'
      }
    }
  },
  
  // Repercap
  repercap: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  numeroCorteSanitarioInicial: {
    type: DataTypes.STRING,
    allowNull: true
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
    defaultValue: 0
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
    type: DataTypes.STRING,
    allowNull: true
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
  tasaRecuperacionRepercap: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'Cálculo específico de recuperación por Repercap'
  },
  
  // Estándares
  standardReal: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
    comment: 'totalUnidades / tiempoTotalActivo (en horas)' // Actualizado
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
      // Calcular tiempo estimado de producción
      if (orden.cantidadProducir && !orden.tiempoEstimadoProduccion) {
        orden.tiempoEstimadoProduccion = orden.cantidadProducir / 4000;
      }
      
      // Restablecer campos calculados
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
    },
    
    beforeSave: (orden, options) => {
      // Verificar si se está llamando desde el método finalizar con hooks: false
      if (options && options.hooks === false) {
        return; // No ejecutar los cálculos si hooks está desactivado
      }
      
      // Calcular total de unidades
      if (orden.unidadesCierreFin !== null && orden.unidadesNoOkFin !== null) {
        orden.totalUnidades = orden.unidadesCierreFin + orden.unidadesNoOkFin;
      }
      
      // Cálculos de métricas solo si hay datos suficientes
      if (orden.tiempoTotal && orden.tiempoTotalActivo) {
        // Disponibilidad (como decimal 0-1)
        orden.disponibilidad = orden.tiempoTotalActivo / orden.tiempoTotal;
        
        // Standard real (unidades por hora)
        // Convertir minutos a horas para el cálculo
        const tiempoActivoHoras = orden.tiempoTotalActivo / 60; // Convertir minutos a horas
        
        if (orden.totalUnidades && tiempoActivoHoras > 0) {
          // Unidades totales (buenas + malas) por hora
          orden.standardReal = orden.totalUnidades / tiempoActivoHoras; // Cambiado a totalUnidades
          
          // Estándar teórico (4000 unidades/hora)
          const standardTeorico = 4000;
          
          // Standard vs teórico (%)
          orden.standardRealVsTeorico = (orden.standardReal / standardTeorico) * 100;
          
          // Rendimiento (como decimal 0-1)
          // Unidades teóricas = tiempo activo en minutos * (standardTeorico / 60)
          const unidadesTeoricas = orden.tiempoTotalActivo * (standardTeorico / 60);
          // Usar totalUnidades (buenas + malas) para el rendimiento
          orden.rendimiento = unidadesTeoricas > 0 ? orden.totalUnidades / unidadesTeoricas : 0;
        }
        
        // Calidad (como decimal 0-1)
        if (orden.totalUnidades && orden.unidadesCierreFin) {
          orden.calidad = orden.unidadesCierreFin / orden.totalUnidades;
        }
        
        // OEE (como decimal 0-1)
        if (orden.disponibilidad !== null && orden.rendimiento !== null && orden.calidad !== null) {
          orden.oee = orden.disponibilidad * orden.rendimiento * orden.calidad;
        }
        
        // Porcentajes de unidades (éstos siguen como porcentajes 0-100)
        if (orden.totalUnidades) {
          orden.porcentajeUnidadesOk = (orden.unidadesCierreFin / orden.totalUnidades) * 100;
          orden.porcentajeUnidadesNoOk = (orden.unidadesNoOkFin / orden.totalUnidades) * 100;
        }
        
        // Porcentaje de completado (sigue como porcentaje 0-100)
        if (orden.cantidadProducir) {
          orden.porcentajeCompletado = (orden.unidadesCierreFin / orden.cantidadProducir) * 100;
        }
        
        // Porcentaje de pausas (sigue como porcentaje 0-100)
        if (orden.tiempoTotal) {
          orden.porcentajePausas = (orden.tiempoTotalPausas / orden.tiempoTotal) * 100;
        }
        
        // Tasa de expulsión (sigue como porcentaje 0-100)
        if (orden.totalUnidades) {
          orden.tasaExpulsion = (orden.unidadesExpulsadas / orden.totalUnidades) * 100;
        }
        
        // Tasa de recuperación ponderal (sigue como porcentaje 0-100)
        if (orden.unidadesPonderalTotal) {
          orden.tasaRecuperacionPonderal = (orden.unidadesRecuperadas / orden.unidadesPonderalTotal) * 100;
        }
      }
    }
  }
});

module.exports = OrdenFabricacion;