const express = require('express');
const JaiStatic = require('../src/index');

const app = express();
const port = 1111;

app.get('*', JaiStatic({
  dir: `${__dirname}/public`,
}));

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}/ ...`);
});
