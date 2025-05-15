const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

const createDatabase = async () => {
  try {
    // Crear conexión a MySQL sin especificar base de datos
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS
    });
    
    console.log('Conexión a MySQL establecida correctamente');
    
    // Crear base de datos si no existe
    const dbName = process.env.DB_NAME || 'sistema_ordenes';
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    console.log(`Base de datos '${dbName}' creada o verificada correctamente`);
    
    // Cerrar conexión
    await connection.end();
    
    console.log('Inicialización de la base de datos completada');
    
    return true;
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    return false;
  }
};

// Si este archivo se ejecuta directamente, crear la base de datos
if (require.main === module) {
  createDatabase()
    .then(success => {
      if (success) {
        console.log('Script de inicialización finalizado correctamente');
        process.exit(0);
      } else {
        console.error('Error durante la inicialización');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error no controlado:', err);
      process.exit(1);
    });
}

module.exports = { createDatabase };