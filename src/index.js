const fs = require('fs');
const path = require('path');

const fsPromise = fs.promises;
const getMime = require('./getMime');

async function createStatic(options, req, res) {
  if (!options || !options.dir) {
    return;
  }
  const sDir = options.dir; // '/public';
  const staticDir = sDir[sDir.length - 1] === '/' ? sDir : `${sDir}/`;
  const sBasePath = options.basePath || '/'; // '/static';
  const staticBasePath = sBasePath[0] === '/' ? sBasePath : `/${sBasePath}`;

  const regx = new RegExp(`^(${staticBasePath})/{0,1}`, 'i');
  let isValidStaticPath = false;
  let filePath = req.url.split('?')[0].toString().replace(regx, () => {
    isValidStaticPath = true;
    return staticDir;
  });

  if (!isValidStaticPath) {
    return;
  }

  if (filePath === staticDir) {
    filePath = `${staticDir}index.html`;
  }
  const extname = String(path.extname(filePath)).toLowerCase();

  const contentType = getMime(extname.slice(1));

  try {
    const content = await fsPromise.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      Expires: '-1',
      Pragma: 'no-cache',
    });
    res.end(content, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'Not Found' }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        statusCode: 500,
        error: 'Internal Server Error - Jai Server',
        message: error.message,
        errorCode: error.code,
      }));
    }
  }
}

function JaiStaticMiddleware(options) {
  return async (req, res, next) => {
    await createStatic(options, req, res, next);
    return next();
  };
}

module.exports = JaiStaticMiddleware;
