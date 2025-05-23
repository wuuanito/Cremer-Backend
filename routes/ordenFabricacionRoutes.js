const express = require('express');
const router = express.Router();
const ordenFabricacionController = require('../controllers/ordenFabricacionController');

// Rutas para órdenes de fabricación
router.get('/', ordenFabricacionController.getAll);
router.get('/:id', ordenFabricacionController.getById);
router.post('/', ordenFabricacionController.create);
router.put('/:id', ordenFabricacionController.update);
router.delete('/:id', ordenFabricacionController.delete);
router.post('/:id/incrementar-botes-buenos', ordenFabricacionController.incrementarBotesBuenos);
router.post('/:id/establecer-botes-buenos', ordenFabricacionController.establecerBotesBuenos);
router.post('/:id/incrementar-botes-expulsados', ordenFabricacionController.incrementarBotesExpulsados);
// Agregar a routes/ordenFabricacionRoutes.js
router.post('/:id/incrementar-botes-operario', ordenFabricacionController.incrementarBotesOperario);
router.post('/:id/establecer-botes-operario', ordenFabricacionController.establecerBotesOperario);
// Rutas para gestión de cajas
router.post('/:id/incrementar-cajas', ordenFabricacionController.incrementarCajas);
router.post('/:id/establecer-cajas', ordenFabricacionController.establecerCajas);
// Rutas especiales para el flujo de trabajo
router.post('/:id/iniciar', ordenFabricacionController.iniciar);
router.post('/:id/pausar', ordenFabricacionController.pausar);
router.post('/:id/finalizar', ordenFabricacionController.finalizar);
router.post('/:id/simular-tiempo', ordenFabricacionController.simularTiempo);

// Ruta para obtener métricas OEE
router.get('/:id/metricas-oee', ordenFabricacionController.obtenerMetricasOEE);
module.exports = router;