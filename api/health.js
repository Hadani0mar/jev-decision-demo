module.exports = async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    configured: Boolean(process.env.TYPESAFE_API_KEY),
    service: "typesafe-jev"
  });
};
