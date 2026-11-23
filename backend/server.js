const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'HisabPro Backend is Live!' });
});

app.listen(4000, () => {
  console.log('Server cholche: http://localhost:4000');
});
