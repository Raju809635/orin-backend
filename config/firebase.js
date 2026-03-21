const admin = require("firebase-admin");
const {
  firebaseProjectId,
  firebaseClientEmail,
  firebasePrivateKey,
  firebaseStorageBucket
} = require("./env");

let initialized = false;

function initFirebase() {
  if (initialized) return true;
  // If another module already initialized firebase-admin, accept it.
  if (admin.apps && admin.apps.length > 0) {
    initialized = true;
    return true;
  }
  if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey || !firebaseStorageBucket) {
    return false;
  }

  const key = String(firebasePrivateKey || "").replace(/\\n/g, "\n");
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: key
    }),
    storageBucket: firebaseStorageBucket
  });
  initialized = true;
  return true;
}

function getBucket() {
  if (!initFirebase()) return null;
  return admin.storage().bucket();
}

module.exports = {
  admin,
  initFirebase,
  getBucket
};
