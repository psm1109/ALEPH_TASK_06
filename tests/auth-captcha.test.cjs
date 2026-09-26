const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const config = read("public/config.js");
const html = read("public/index.html");
const app = read("public/app.js");
const gateway = read("supabase/functions/auth-gateway/index.ts");

assert.match(config, /turnstileSiteKey:\s*"0x[0-9A-Za-z_-]+"/);
assert.match(html, /id="login-captcha"/);
assert.match(html, /id="signup-captcha"/);
assert.match(app, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
assert.match(app, /window\.turnstile\.render/);
assert.match(app, /captcha_token: captchaToken/);
assert.match(app, /resetCaptcha\("login"\)/);
assert.match(app, /resetCaptcha\("signup"\)/);
assert.match(gateway, /body\.captcha_token/);
assert.match(gateway, /gotrue_meta_security:\s*\{ captcha_token: captchaToken \}/);
assert.doesNotMatch(config, /turnstileSecret|captchaSecret/i);
assert.doesNotMatch(app, /turnstileSecret|captchaSecret/i);
assert.doesNotMatch(gateway, /console\.(?:log|debug|info|warn|error)\(/);

console.log("auth captcha checks: 13 passed");
