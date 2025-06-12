// Modelo de Pausa (pausa.js)

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const OrdenFabricacion = require('./ordenFabricacion');

const Pausa = sequelize.define('Pausa', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ordenFabricacionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: OrdenFabricacion,
      key: 'id'
    }
  },
  horaInicio: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  horaFin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duracion: {
    type: DataTypes.INTEGER, // duración en minutos
    allowNull: true,
    comment: 'Duración de la pausa en minutos'
  },
  tipoPausa: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Tipo/Razón de la pausa'
  },
  comentario: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  computaEnTiempo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Indica si esta pausa debe computar en el tiempo total de pausas'
  }
}, {
  tableName: 'pausas',
  timestamps: true,
  hooks: {
   beforeValidate: (pausa) => {
  // Establecer automáticamente si la pausa computa en tiempo según su tipo
  if (pausa.tipoPausa === 'cambio_turno' || pausa.tipoPausa === 'pausa_parcial') {
    pausa.computaEnTiempo = false;
  } else {
    pausa.computaEnTiempo = true;
  }
}
  }
});

// Establecer relación: Una OrdenFabricacion tiene muchas Pausas
OrdenFabricacion.hasMany(Pausa, {
  foreignKey: 'ordenFabricacionId',
  as: 'pausas'
});

// Una Pausa pertenece a una OrdenFabricacion
Pausa.belongsTo(OrdenFabricacion, {
  foreignKey: 'ordenFabricacionId',
  as: 'ordenFabricacion'
});

// Definir todos los tipos de pausa disponibles
Pausa.TIPOS_PAUSA = [
  // Razones estándar (computan tiempo)
  { 
    value: 'Preparación Arranque', 
    label: 'Preparación Arranque',
    computaEnTiempo: true
  },
  { 
    value: 'Verificación Calidad', 
    label: 'Verificación Calidad',
    computaEnTiempo: true
  },
  { 
    value: 'Falta de Material', 
    label: 'Falta de Material',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Posicionadora', 
    label: 'Incidencia Máquina: Posicionadora',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Contadora', 
    label: 'Incidencia Máquina: Contadora',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Taponadora', 
    label: 'Incidencia Máquina: Taponadora',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Etiquetadora', 
    label: 'Incidencia Máquina: Etiquetadora',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Controladora de Peso', 
    label: 'Incidencia Máquina: Controladora de Peso',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Repercap', 
    label: 'Incidencia Máquina: Repercap',
    computaEnTiempo: true
  },
  { 
    value: 'Incidencia Máquina: Otros', 
    label: 'Incidencia Máquina: Otros',
    computaEnTiempo: true
  },
  { 
    value: 'Mantenimiento', 
    label: 'Mantenimiento',
    computaEnTiempo: true
  },
  
  // Tipos especiales (no computan tiempo)
  {
    value: 'cambio_turno',
    label: 'Cambio de Turno',
    description: 'Pausa por cambio de turno (8 horas aprox.)',
    computaEnTiempo: false
  },
  {
    value: 'pausa_parcial',
    label: 'Pausa Parcial',
    description: 'Pausa por orden más urgente',
    computaEnTiempo: false
  }
];

module.exports = Pausa;