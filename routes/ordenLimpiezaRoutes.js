const express = require('express');
const router = express.Router();
const ordenLimpiezaController = require('../controllers/ordenLimpiezaController');

// Rutas para órdenes de limpieza
router.get('/', ordenLimpiezaController.getAll);
router.get('/:id', ordenLimpiezaController.getById);
router.post('/', ordenLimpiezaController.create);
router.put('/:id', ordenLimpiezaController.update);
router.delete('/:id', ordenLimpiezaController.delete);

// Rutas especiales para el flujo de trabajo
router.post('/:id/iniciar', ordenLimpiezaController.iniciar);
router.post('/:id/finalizar', ordenLimpiezaController.finalizar);

module.exports = router;