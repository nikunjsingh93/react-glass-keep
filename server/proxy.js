// Explicit opt-in: never accept forwarded client IPs from every caller by default.
function configureProxy(app, value = process.env.TRUST_PROXY) {
  if (!value || value === 'false' || value === '0') return;
  if (/^[1-9]\d*$/.test(value)) app.set('trust proxy', Number(value));
  else if (value === 'true') throw new Error('Use a proxy hop count or trusted IP/subnet for TRUST_PROXY, not true.');
  else app.set('trust proxy', value.split(',').map(s => s.trim()).filter(Boolean));
}
module.exports = { configureProxy };
