/**
 * GitHub Webhook Server for VPS Auto-Update
 *
 * PHASE 14: Alternative to cron - instant updates on push
 *
 * SETUP:
 * 1. Install: npm install express
 * 2. Run: node webhook-server.js
 * 3. Add to GitHub repo Settings > Webhooks:
 *    - Payload URL: http://your-vps:9000/webhook
 *    - Content type: application/json
 *    - Secret: your-webhook-secret
 *    - Events: Just the push event
 *
 * Run with PM2:
 *   pm2 start webhook-server.js --name swaperex-webhook
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

// Configuration
const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret';
const BRANCH = process.env.BRANCH || 'main';
const UPDATE_SCRIPT = process.env.UPDATE_SCRIPT || '/opt/swaperex/vps-auto-update.sh';

/**
 * Verify GitHub signature
 */
function verifySignature(payload, signature) {
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Run update script
 */
function runUpdate() {
  console.log(`[Webhook] ${new Date().toISOString()} | Running update script...`);

  exec(UPDATE_SCRIPT, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Webhook] Update error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`[Webhook] Update stderr: ${stderr}`);
    }
    console.log(`[Webhook] Update output: ${stdout}`);
  });
}

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'];
    if (!verifySignature(body, signature)) {
      console.log(`[Webhook] ${new Date().toISOString()} | Invalid signature`);
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    // Check if it's a push to our branch
    const ref = payload.ref;
    const expectedRef = `refs/heads/${BRANCH}`;

    if (ref !== expectedRef) {
      console.log(`[Webhook] ${new Date().toISOString()} | Ignoring push to ${ref}`);
      res.writeHead(200);
      res.end('OK - Ignored');
      return;
    }

    console.log(`[Webhook] ${new Date().toISOString()} | Push to ${BRANCH} detected`);
    console.log(`[Webhook] Commits: ${payload.commits?.length || 0}`);
    console.log(`[Webhook] Pusher: ${payload.pusher?.name || 'unknown'}`);

    // Trigger update
    runUpdate();

    res.writeHead(200);
    res.end('OK - Update triggered');
  });
});

server.listen(PORT, () => {
  console.log(`[Webhook] Server listening on port ${PORT}`);
  console.log(`[Webhook] Branch: ${BRANCH}`);
  console.log(`[Webhook] Update script: ${UPDATE_SCRIPT}`);
});
