const http = require('http');
const JaiStatic = require('../src/index');

const server = http.createServer(async (req, res) => {
  JaiStatic({
    dir: `${__dirname}/public`,
  })(req, res, () => { /* do something after */ });
});

server.listen(1111, () => {
  console.log('Server listening on http://localhost:1111/ ...');
});
