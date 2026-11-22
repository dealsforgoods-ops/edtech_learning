const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'isolated-integration-test-secret';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017';
const app = require('../server');
let connections = 0;
app.connectDatabase = async () => {
  connections += 1;
  return { db: () => ({}) };
};
const { handler } = require('../netlify/functions/api');
app.get('/api/test-binary', (request, response) => {
  response.type('application/octet-stream').send(Buffer.from([0, 128, 255]));
});

test('Netlify handler handles API requests and reuses a database connection', async () => {
  const event = {
    httpMethod: 'GET',
    path: '/api/health',
    headers: {},
    requestContext: {},
    isBase64Encoded: false,
  };
  const first = await handler(event, {});
  const second = await handler(event, {});
  assert.equal(first.statusCode, 200);
  assert.deepEqual(JSON.parse(first.body), { status: 'ok', application: 'EdTech ELearn API' });
  assert.equal(second.statusCode, 200);
  assert.equal(connections, 1);
});

test('Netlify handler returns file chunks as binary without corruption', async () => {
  const result = await handler({
    httpMethod: 'GET', path: '/api/test-binary', headers: {},
    requestContext: {}, isBase64Encoded: false,
  }, {});
  assert.equal(result.statusCode, 200);
  assert.equal(result.isBase64Encoded, true);
  assert.deepEqual(Buffer.from(result.body, 'base64'), Buffer.from([0, 128, 255]));
});
