module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ marker: 'PING_OK' }));
};
