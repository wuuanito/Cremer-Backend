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
    allowNull: false
  },
  comentario: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'pausas',
  timestamps: true
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

module.exports = Pausa;