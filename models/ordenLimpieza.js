const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OrdenLimpieza = sequelize.define('OrdenLimpieza', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  horaInicio: {
    type: DataTypes.DATE,
    allowNull: true
  },
  horaFin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duracion: {
    type: DataTypes.INTEGER, // duración en segundos
    allowNull: true
  },
  estado: {
    type: DataTypes.ENUM('creada', 'iniciada', 'finalizada'),
    defaultValue: 'creada',
    allowNull: false
  }
}, {
  tableName: 'ordenes_limpieza',
  timestamps: true
});

module.exports = OrdenLimpieza;