#!/usr/bin/env node
/**
 * Skye Keep-Alive Monitor
 * Checks if Skye is running every 30 seconds and restarts it if not responding
 */

import { spawn, execSync } from 'child_process';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKYE_DIR = join(__dirname, '..');
const PID_FILE = join(SKYE_DIR, 'skye.pid');
const LOG_FILE = join(SKYE_DIR, 'skye.log');
const RESTART_FLAG = '/tmp/skye_restart';

const SERVER_PORT = 3001;
const CLIENT_PORT = 5055;
const CHECK_INTERVAL = 30000; // 30 seconds

function log(message) {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  console.log(`[${timestamp}] ${message}`);
}

function isResponding() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}/health`, { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findSkyeProcesses() {
  try {
    // Find node processes running SkyeJS
    const result = execSync('pgrep -f "node.*SkyeJS" 2>/dev/null || true', { encoding: 'utf-8' });
    return result.trim().split('\n').filter(pid => pid.length > 0).map(Number);
  } catch {
    return [];
  }
}

function killSkyeProcesses() {
  const pids = findSkyeProcesses();
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`Killed process ${pid}`);
    } catch (err) {
      // Process may have already exited
    }
  }

  // Also kill any processes on our ports
  try {
    execSync(`lsof -ti:${SERVER_PORT} | xargs kill -9 2>/dev/null || true`, { encoding: 'utf-8' });
    execSync(`lsof -ti:${CLIENT_PORT} | xargs kill -9 2>/dev/null || true`, { encoding: 'utf-8' });
  } catch {
    // Ignore errors
  }

  // Remove PID file
  if (existsSync(PID_FILE)) {
    unlinkSync(PID_FILE);
  }
}

function startSkye() {
  return new Promise((resolve, reject) => {
    log('Starting Skye...');

    // Start npm run dev in the background
    const child = spawn('npm', ['run', 'dev'], {
      cwd: SKYE_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    // Write PID file
    writeFileSync(PID_FILE, child.pid.toString());

    // Log output to file
    const logStream = require('fs').createWriteStream(LOG_FILE, { flags: 'a' });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    // Detach the child process
    child.unref();

    // Wait a bit and check if it started
    setTimeout(async () => {
      const responding = await isResponding();
      if (responding) {
        log(`Skye started successfully (PID: ${child.pid})`);
        log(`Server: http://localhost:${SERVER_PORT}`);
        log(`Client: http://localhost:${CLIENT_PORT}`);
        resolve();
      } else {
        log('Skye started but not yet responding (may still be initializing)');
        resolve();
      }
    }, 5000);

    child.on('error', (err) => {
      log(`Failed to start Skye: ${err.message}`);
      reject(err);
    });
  });
}

async function restartSkye() {
  try {
    killSkyeProcesses();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await startSkye();
  } catch (err) {
    log(`Failed to restart Skye: ${err.message}`);
  }
}

async function main() {
  log('Skye monitor started (checking every 30s)');
  log(`Monitoring server on port ${SERVER_PORT}`);

  // Initial check
  const initialCheck = await isResponding();
  if (!initialCheck) {
    log('Skye not responding on startup');
    await restartSkye();
  } else {
    log('Skye is already running');
  }

  // Main monitoring loop
  setInterval(async () => {
    try {
      // Check for manual restart flag
      if (existsSync(RESTART_FLAG)) {
        unlinkSync(RESTART_FLAG);
        log('Restart flag detected');
        await restartSkye();
        return;
      }

      // Check if responding
      const responding = await isResponding();
      if (!responding) {
        log('Skye not responding');
        await restartSkye();
      }
    } catch (err) {
      log(`Monitor error: ${err.message}`);
    }
  }, CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Monitor stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Monitor stopped');
  process.exit(0);
});

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
