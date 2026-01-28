#!/usr/bin/env node

/**
 * Dependency Check Script
 * Automatically installs dependencies if node_modules is missing
 * Runs before dev and start commands
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}[Skye]${colors.reset} ${message}`);
}

function checkAndInstall() {
  // Prevent recursive calls during npm install
  if (process.env.SKYE_INSTALLING === 'true') {
    return;
  }

  const rootModules = join(rootDir, 'node_modules');

  // With npm workspaces, all deps are hoisted to root node_modules
  // Just check if root node_modules exists
  const needsInstall = !existsSync(rootModules);

  if (needsInstall) {
    log('Dependencies missing - installing...', 'yellow');

    try {
      // Run npm install from root (handles workspaces automatically)
      // Use --ignore-scripts to prevent recursive hooks
      execSync('npm install --ignore-scripts', {
        cwd: rootDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_yes: 'true',
          SKYE_INSTALLING: 'true'
        },
      });

      log('Dependencies installed successfully!', 'green');
    } catch (error) {
      log(`Failed to install dependencies: ${error.message}`, 'red');
      process.exit(1);
    }
  }
}

// Also check for critical workspace dependencies
function checkWorkspaceDeps() {
  const serverPkg = join(rootDir, 'server', 'package.json');
  const clientPkg = join(rootDir, 'client', 'package.json');

  if (!existsSync(serverPkg) || !existsSync(clientPkg)) {
    log('Missing package.json files - cannot verify dependencies', 'red');
    process.exit(1);
  }
}

// Run checks
checkWorkspaceDeps();
checkAndInstall();
