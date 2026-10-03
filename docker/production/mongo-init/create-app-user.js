// Se ejecuta una sola vez, al crear el volumen de datos: usuario de la aplicación con permisos
// solo sobre su base (la API nunca usa la cuenta root).
db.getSiblingDB('asisteglt').createUser({
  user: 'asisteglt',
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'asisteglt' }],
});
