const serverless = require('serverless-http');
const app = require('../../server');

const serve = serverless(app, { binary: ['application/octet-stream'] });
let databasePromise;

exports.handler = async (event, context) => {
  if (!databasePromise) {
    databasePromise = app.connectDatabase({ serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 })
      .then((client) => {
        app.locals.db = client.db('edtech-elearn');
        return client;
      })
      .catch((error) => {
        databasePromise = undefined;
        throw error;
      });
  }
  try {
    await databasePromise;
    context.callbackWaitsForEmptyEventLoop = false;
    return await serve(event, context);
  } catch (error) {
    console.error('Serverless API failed:', error);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Service temporarily unavailable' }),
    };
  }
};
