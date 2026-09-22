function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function encryptAuthCredentials(publicKeyJwk, email, password) {
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clearBytes = new TextEncoder().encode(JSON.stringify({ email, password }));

  try {
    const [ciphertext, rawAesKey] = await Promise.all([
      crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, clearBytes),
      crypto.subtle.exportKey("raw", aesKey),
    ]);
    const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawAesKey);
    new Uint8Array(rawAesKey).fill(0);
    return {
      encrypted_key: bytesToBase64(new Uint8Array(encryptedKey)),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  } finally {
    clearBytes.fill(0);
  }
}
