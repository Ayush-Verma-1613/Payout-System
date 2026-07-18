// Wraps an async Express handler so any thrown/rejected error is forwarded to the
// centralized error middleware instead of crashing the request.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
