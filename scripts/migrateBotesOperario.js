// scripts/migrateBotesOperario.js

const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const migrateBotesOperario = async () => {
  try {
    console.log('Iniciando migración para agregar campo botesOperario...');
    
    // Verificar si la columna ya existe
    const checkColumn = await sequelize.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'ordenes_fabricacion' 
       AND COLUMN_NAME = 'botesOperario'`,
      { type: QueryTypes.SELECT }
    );
    
    if (checkColumn.length === 0) {
      // La columna no existe, agregarla
      await sequelize.query(
        `ALTER TABLE ordenes_fabricacion 
         ADD COLUMN botesOperario INT NOT NULL DEFAULT 0 
         COMMENT 'Cantidad de botes registrados por el operario'`
      );
      console.log('Campo botesOperario agregado correctamente');
    } else {
      console.log('El campo botesOperario ya existe en la tabla');
    }
    
    console.log('Migración completada con éxito');
    return true;
  } catch (error) {
    console.error('Error durante la migración:', error);
    return false;
  }
};

// Si este archivo se ejecuta directamente, ejecutar la migración
if (require.main === module) {
  migrateBotesOperario()
    .then(success => {
      if (success) {
        console.log('Script de migración finalizado correctamente');
        process.exit(0);
      } else {
        console.error('Error durante la migración');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error no controlado:', err);
      process.exit(1);
    });
}

module.exports = { migrateBotesOperario };