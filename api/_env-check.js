module.exports = async (req, res) => {
  const have = k => Boolean(process.env[k] && process.env[k].trim() !== '');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({
    GOOGLE_CLIENT_ID: have('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: have('GOOGLE_CLIENT_SECRET'),
    GOOGLE_REFRESH_TOKEN: have('GOOGLE_REFRESH_TOKEN'),
    ENV: process.env.VERCEL_ENV || 'unknown'
  }));
};
