const express = require('express');
const router = express.Router();
const pausaController = require('../controllers/pausaController');

// Rutas para pausas
// Obtener todas las pausas
router.get('/', pausaController.getAll);

// Obtener tipos de pausa disponibles
router.get('/tipos', pausaController.getTiposPausa);

// Obtener estadísticas de pausas por tipo para una orden específica
router.get('/estadisticas/:ordenFabricacionId', pausaController.getEstadisticasPausas);

// Obtener todas las pausas de una orden específica
router.get('/orden/:ordenFabricacionId', pausaController.getByOrdenFabricacion);

// Obtener una pausa específica por ID
router.get('/:id', pausaController.getById);

// Crear una nueva pausa manualmente
router.post('/', pausaController.crearPausa);

// Finalizar una pausa (reanudar la orden)
router.post('/:id/finalizar', pausaController.finalizarPausa);

// Actualizar información de una pausa
router.put('/:id', pausaController.update);

// Eliminar una pausa
router.delete('/:id', pausaController.delete);

module.exports = router;