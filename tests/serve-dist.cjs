const http = require('http')
const fs = require('fs')
const path = require('path')

const dist = path.join(__dirname, '..', 'dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

http.createServer((req, res) => {
  let p = req.url.split('?')[0]
  if (p === '/') p = '/index.html'
  const f = path.join(dist, p)
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(4590, () => console.log('static server on http://localhost:4590'))
