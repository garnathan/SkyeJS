/**
 * TP-Link Tapo KLAP Protocol Implementation
 *
 * KLAP (Key-Less Authentication Protocol) is the newer protocol used by
 * Tapo devices. It uses a two-phase handshake with SHA256/SHA1 hashing.
 */

import crypto from 'crypto';
import http from 'http';
import logger from '../utils/logger.js';

const KLAP_PORT = 80;
const TIMEOUT_MS = 10000;

/**
 * Generate auth hash from credentials
 * auth_hash = SHA256(SHA1(username) + SHA1(password))
 * Note: username is NOT lowercased per python-kasa implementation
 */
const generateAuthHash = (username, password) => {
  const usernameHash = crypto.createHash('sha1').update(Buffer.from(username)).digest();
  const passwordHash = crypto.createHash('sha1').update(Buffer.from(password)).digest();
  return crypto.createHash('sha256').update(Buffer.concat([usernameHash, passwordHash])).digest();
};

/**
 * KLAP Cipher for encryption/decryption after handshake
 */
class KlapCipher {
  constructor(localSeed, remoteSeed, authHash) {
    // Derive encryption key and IV
    const keyDerivation = Buffer.concat([
      Buffer.from('lsk'),
      localSeed,
      remoteSeed,
      authHash
    ]);

    const ivDerivation = Buffer.concat([
      Buffer.from('iv'),
      localSeed,
      remoteSeed,
      authHash
    ]);

    // SHA256 for key derivation
    this.key = crypto.createHash('sha256').update(keyDerivation).digest().subarray(0, 16);

    // Create IV sequence
    const ivSeqHash = crypto.createHash('sha256').update(ivDerivation).digest();
    this.ivSeq = ivSeqHash.subarray(0, 12);

    // Initialize sequence number
    this.seq = ivSeqHash.readInt32BE(12);

    // Signature derivation
    const sigDerivation = Buffer.concat([
      Buffer.from('ldk'),
      localSeed,
      remoteSeed,
      authHash
    ]);
    this.sig = crypto.createHash('sha256').update(sigDerivation).digest().subarray(0, 28);
  }

  encrypt(data) {
    this.seq++;
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(this.seq);

    const iv = Buffer.concat([this.ivSeq, seqBuf]);

    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv);
    cipher.setAutoPadding(true);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    // Create signature
    const sigData = Buffer.concat([this.sig, seqBuf, encrypted]);
    const signature = crypto.createHash('sha256').update(sigData).digest();

    return {
      data: Buffer.concat([signature, encrypted]),
      seq: this.seq
    };
  }

  decrypt(data) {
    // Skip the 32-byte signature
    const encrypted = data.subarray(32);

    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(this.seq);

    const iv = Buffer.concat([this.ivSeq, seqBuf]);

    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv);
    decipher.setAutoPadding(true);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * KLAP Protocol Session
 */
class KlapSession {
  constructor(ip, email, password) {
    this.ip = ip;
    this.authHash = generateAuthHash(email, password);
    this.cipher = null;
    this.cookie = null;
    this.localSeed = null;
    this.remoteSeed = null;
  }

  async httpRequest(path, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.ip,
        port: KLAP_PORT,
        path: '/app' + path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': body.length,
        },
        timeout: TIMEOUT_MS,
      };

      if (this.cookie) {
        options.headers['Cookie'] = this.cookie;
      }

      logger.debug(`KLAP request to ${this.ip}${path} with ${body.length} bytes`);

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          logger.debug(`KLAP response: ${res.statusCode}, ${responseBody.length} bytes`);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseBody,
          });
        });
      });

      req.on('error', (e) => {
        logger.error(`KLAP HTTP error for ${this.ip}${path}:`, e.message);
        reject(e);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  async handshake() {
    // Phase 1: Send local seed, receive remote seed
    this.localSeed = crypto.randomBytes(16);

    const hs1Response = await this.httpRequest('/handshake1', this.localSeed);

    if (hs1Response.status !== 200) {
      throw new Error(`Handshake1 failed: HTTP ${hs1Response.status}`);
    }

    // Extract cookie for session
    const setCookie = hs1Response.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      const match = setCookie[0].match(/TP_SESSIONID=([^;]+)/);
      if (match) {
        this.cookie = `TP_SESSIONID=${match[1]}`;
      }
    }

    const hs1Data = hs1Response.body;

    // Response format: remote_seed (16 bytes) + server_hash (32 bytes)
    this.remoteSeed = hs1Data.subarray(0, 16);
    const serverHash = hs1Data.subarray(16, 48);

    // Verify server hash
    // server_hash should equal SHA256(local_seed + remote_seed + auth_hash)
    const expectedHash = crypto.createHash('sha256')
      .update(Buffer.concat([this.localSeed, this.remoteSeed, this.authHash]))
      .digest();

    if (!serverHash.equals(expectedHash)) {
      // Try with blank credentials (device might not be claimed yet)
      logger.debug('Server hash mismatch with provided credentials, trying blank credentials');
      const blankAuthHash = generateAuthHash('', '');
      const blankExpected = crypto.createHash('sha256')
        .update(Buffer.concat([this.localSeed, this.remoteSeed, blankAuthHash]))
        .digest();

      if (serverHash.equals(blankExpected)) {
        logger.info('Device accepted blank credentials (unclaimed device)');
        this.authHash = blankAuthHash;
      } else {
        // Try with Kasa credentials (default setup)
        const kasaAuthHash = generateAuthHash('test@test.com', 'test');
        const kasaExpected = crypto.createHash('sha256')
          .update(Buffer.concat([this.localSeed, this.remoteSeed, kasaAuthHash]))
          .digest();

        if (serverHash.equals(kasaExpected)) {
          logger.info('Device accepted Kasa test credentials');
          this.authHash = kasaAuthHash;
        } else {
          logger.error(`Credentials mismatch - verify your TP-Link account email and password`);
          throw new Error('Server hash verification failed - check your TP-Link credentials in settings');
        }
      }
    }

    // Phase 2: Send client verification
    const clientHash = crypto.createHash('sha256')
      .update(Buffer.concat([this.remoteSeed, this.localSeed, this.authHash]))
      .digest();

    const hs2Response = await this.httpRequest('/handshake2', clientHash);

    if (hs2Response.status !== 200) {
      throw new Error(`Handshake2 failed: HTTP ${hs2Response.status}`);
    }

    // Create cipher for subsequent requests
    this.cipher = new KlapCipher(this.localSeed, this.remoteSeed, this.authHash);

    logger.info(`KLAP handshake successful for ${this.ip}`);
  }

  async sendRequest(payload) {
    if (!this.cipher) {
      await this.handshake();
    }

    const jsonPayload = JSON.stringify(payload);
    const encrypted = this.cipher.encrypt(Buffer.from(jsonPayload));

    const response = await this.httpRequest(`/request?seq=${encrypted.seq}`, encrypted.data);

    if (response.status !== 200) {
      // Session might have expired, try re-handshaking
      if (response.status === 403) {
        this.cipher = null;
        await this.handshake();
        return this.sendRequest(payload);
      }
      throw new Error(`Request failed: HTTP ${response.status}`);
    }

    const decrypted = this.cipher.decrypt(response.body);

    return JSON.parse(decrypted.toString());
  }

  async getDeviceInfo() {
    const response = await this.sendRequest({
      method: 'get_device_info',
      params: {}
    });

    if (response.error_code !== 0) {
      throw new Error(`Get device info failed: ${response.error_code}`);
    }

    return response.result;
  }

  async turnOn() {
    const response = await this.sendRequest({
      method: 'set_device_info',
      params: { device_on: true }
    });

    if (response.error_code !== 0) {
      throw new Error(`Turn on failed: ${response.error_code}`);
    }

    return response;
  }

  async turnOff() {
    const response = await this.sendRequest({
      method: 'set_device_info',
      params: { device_on: false }
    });

    if (response.error_code !== 0) {
      throw new Error(`Turn off failed: ${response.error_code}`);
    }

    return response;
  }

  async setBrightness(brightness) {
    const response = await this.sendRequest({
      method: 'set_device_info',
      params: { brightness: Math.max(1, Math.min(100, brightness)) }
    });

    if (response.error_code !== 0) {
      throw new Error(`Set brightness failed: ${response.error_code}`);
    }

    return response;
  }

  async setColor(hue, saturation) {
    const response = await this.sendRequest({
      method: 'set_device_info',
      params: {
        hue: hue,
        saturation: saturation,
        color_temp: 0 // Must be 0 when using HSV
      }
    });

    if (response.error_code !== 0) {
      throw new Error(`Set color failed: ${response.error_code}`);
    }

    return response;
  }

  async setColorTemp(colorTemp) {
    const response = await this.sendRequest({
      method: 'set_device_info',
      params: { color_temp: colorTemp }
    });

    if (response.error_code !== 0) {
      throw new Error(`Set color temp failed: ${response.error_code}`);
    }

    return response;
  }
}

/**
 * Create a new KLAP session
 */
export const createSession = (ip, email, password) => {
  return new KlapSession(ip, email, password);
};

export default {
  createSession,
  KlapSession
};
