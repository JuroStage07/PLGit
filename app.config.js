// google-services.json no se sube a Git. Local: copia google-services.example.json → google-services.json.
// EAS: secret de archivo GOOGLE_SERVICES_JSON en expo.dev (ruta al JSON en el worker de build).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
  },
});
