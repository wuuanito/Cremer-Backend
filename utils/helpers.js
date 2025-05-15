// Función para formatear fecha en formato legible
exports.formatDate = (date) => {
    if (!date) return '';
    
    const options = { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    };
    
    return new Date(date).toLocaleString('es-ES', options);
  };
  
  // Función para formatear duración en formato hh:mm:ss
  exports.formatDuration = (seconds) => {
    if (!seconds) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };
  
  // Función para generar código único para órdenes
  exports.generateUniqueCode = (prefix, date = new Date()) => {
    const timestamp = date.getTime().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  };
  
  // Función para verificar si hay superposición entre dos períodos de tiempo
  exports.checkOverlap = (startA, endA, startB, endB) => {
    // Si alguna fecha es null, no hay superposición
    if (!startA || !endA || !startB || !endB) return false;
    
    // Convertir a objetos Date si son strings
    const start1 = startA instanceof Date ? startA : new Date(startA);
    const end1 = endA instanceof Date ? endA : new Date(endA);
    const start2 = startB instanceof Date ? startB : new Date(startB);
    const end2 = endB instanceof Date ? endB : new Date(endB);
    
    // Verificar superposición
    return start1 <= end2 && start2 <= end1;
  };
  
  // Función para validar formato de código sanitario
  exports.validateSanitaryCode = (code) => {
    // Este es un ejemplo, adaptar según el formato real requerido
    const regex = /^[A-Z]{2}-\d{6}$/;
    return regex.test(code);
  };