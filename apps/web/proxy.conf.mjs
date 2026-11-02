// Proxy /api de la web de desarrollo hacia la API. Sigue a API_PORT, que Nx carga de
// .env.development y .env.development.local (o del sistema), así web y API coinciden aunque cambies
// el puerto en tu equipo.
const apiPort = (process.env.API_PORT ?? '').trim() || '3000';

export default {
  '/api': {
    target: `http://localhost:${apiPort}`,
    secure: false,
    ws: true,
  },
};
