# Jai Static
A simple and fast node.js module to serve static files effortlessly. Config base path and public folder path.

---
[![Twitter Follow](https://img.shields.io/twitter/follow/Harpalsingh_11?label=Follow)](https://twitter.com/intent/follow?screen_name=Harpalsingh_11)
[![Linkedin: Harpal Singh](https://img.shields.io/badge/-harpalsingh11-blue?style=flat-square&logo=Linkedin&logoColor=white&link=https://www.linkedin.com/in/harpalsingh11)](https://www.linkedin.com/in/harpalsingh11/)
[![GitHub followers](https://img.shields.io/github/followers/hsk11?label=Follow&style=social)](https://github.com/hsk11)
---


## Features

- Easy Setup
- Works with any framework





## Installation

Install my-project with npm

```bash
  npm install jai-static
```

### Usage / Examples

```javascript
// Express
const express = require('express');
const JaiStatic = require('jai-static');

const app = express();
const port = 1111;

app.get('*', JaiStatic({
  dir: `${__dirname}/public`, // public folder
}));

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}/ ...`);
});


//  OR Http

const http = require('http');
const JaiStatic = require('jai-static');

const server = http.createServer(async (req, res) => {
  JaiStatic({
    dir: `${__dirname}/public`, // public folder
  })(req, res, () => { /* do something after */ });
});

server.listen(1111, () => {
  console.log('Server listening on http://localhost:1111/ ...');
});

```

## API Reference

### Options


| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `dir` | `string` |  destination folder path. (Required)|
| `basePath` | `string` | base path to be used on server, default '/' (optional)|


### Author: [@hsk11](https://github.com/hsk11)
