// routes/reporteRoutes.js
const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');

// Rutas para reportes de órdenes
router.get('/orden-fabricacion/:id', reporteController.getReporteOrdenFabricacion);
router.get('/produccion', reporteController.getReporteProduccion);
router.get('/eficiencia-diaria', reporteController.getReporteEficienciaDiaria);
router.get('/pausas', reporteController.getReportePausas);
router.get('/comparativa-botes', reporteController.getReporteComparativoBotes);
router.get('/limpiezas', reporteController.getReporteLimpiezas);
router.get('/kpis', reporteController.getReporteKPI);

// Rutas para reportes de máquinas
router.get('/maquinas', reporteController.getReporteEstadoMaquinas);
router.get('/maquina/:id', reporteController.getReporteMaquina);

module.exports = router;