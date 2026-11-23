const { app } = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HisabPro v2.0 Complete Backend running on http://localhost:${PORT}`);
});
