const express = require('express');
const router = express.Router();
const pausaController = require('../controllers/pausaController');

// Rutas para pausas
router.get('/', pausaController.getAll);
router.get('/:id', pausaController.getById);
router.get('/orden/:ordenFabricacionId', pausaController.getByOrdenFabricacion);
router.put('/:id', pausaController.update);
router.post('/:id/finalizar', pausaController.finalizarPausa);

module.exports = router;