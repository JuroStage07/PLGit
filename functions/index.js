const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normHandle(t) {
  return String(t || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

// 1) Enviar solicitud por @usuario
exports.sendPartnerRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const toUsuario = normHandle(request.data?.toUsuario);
  if (!toUsuario) throw new HttpsError("invalid-argument", "Falta toUsuario.");

  const myRef = db.doc(`users/${uid}`);
  const mySnap = await myRef.get();
  if (!mySnap.exists) throw new HttpsError("failed-precondition", "Tu perfil no existe.");

  const myData = mySnap.data() || {};
  const myUsuario = normHandle(myData.usuario);
  const myNombre = String(myData.nombre || "");

  if (!myUsuario) throw new HttpsError("failed-precondition", "Tu usuario (@) no está configurado.");
  if (toUsuario === myUsuario) throw new HttpsError("failed-precondition", "No puedes enviarte solicitud a ti mismo.");

  // si ya tienes partner
  if (myData.partnerUid) throw new HttpsError("failed-precondition", "Ya tienes compañero.");

  // buscar destinatario
  const q = await db.collection("users").where("usuario", "==", toUsuario).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", `No existe @${toUsuario}`);

  const targetDoc = q.docs[0];
  const targetUid = targetDoc.id;
  const targetData = targetDoc.data() || {};

  if (targetData.partnerUid) throw new HttpsError("failed-precondition", "Ese usuario ya tiene compañero.");

  // crear solicitud en el receptor (docId = uid del emisor)
  await db.doc(`users/${targetUid}/partnerRequests/${uid}`).set({
    fromUid: uid,
    fromUsuario: myUsuario,
    fromNombre: myNombre,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

// 2) Rechazar solicitud
exports.rejectPartnerRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const fromUid = String(request.data?.fromUid || "").trim();
  if (!fromUid) throw new HttpsError("invalid-argument", "Falta fromUid.");

  await db.doc(`users/${uid}/partnerRequests/${fromUid}`).delete();
  return { ok: true };
});

// 3) Aceptar solicitud (ES LA CLAVE para evitar insufficient permissions)
exports.acceptPartnerRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const fromUid = String(request.data?.fromUid || "").trim();
  if (!fromUid) throw new HttpsError("invalid-argument", "Falta fromUid.");

  const myRef = db.doc(`users/${uid}`);
  const otherRef = db.doc(`users/${fromUid}`);

  await db.runTransaction(async (tx) => {
    const [mySnap, otherSnap, reqSnap] = await Promise.all([
      tx.get(myRef),
      tx.get(otherRef),
      tx.get(db.doc(`users/${uid}/partnerRequests/${fromUid}`)),
    ]);

    if (!mySnap.exists) throw new HttpsError("failed-precondition", "Tu perfil no existe.");
    if (!otherSnap.exists) throw new HttpsError("failed-precondition", "El usuario no existe.");
    if (!reqSnap.exists) throw new HttpsError("failed-precondition", "La solicitud ya no existe.");

    const myData = mySnap.data() || {};
    const otherData = otherSnap.data() || {};
    const reqData = reqSnap.data() || {};

    if (myData.partnerUid) throw new HttpsError("failed-precondition", "Ya tienes compañero.");
    if (otherData.partnerUid) throw new HttpsError("failed-precondition", "La otra persona ya tiene compañero.");

    const myUsuario = normHandle(myData.usuario);
    const myNombre = String(myData.nombre || "");

    const otherUsuario = normHandle(reqData.fromUsuario || otherData.usuario);
    const otherNombre = String(reqData.fromNombre || otherData.nombre || "");

    const ts = admin.firestore.FieldValue.serverTimestamp();

    // escribir en ambos users (server)
    tx.update(myRef, {
      partnerUid: fromUid,
      partnerUsuario: otherUsuario,
      partnerNombre: otherNombre,
      partnerGenero: String(otherData.genero || ""),
      partneredAt: ts,
    });

    tx.update(otherRef, {
      partnerUid: uid,
      partnerUsuario: myUsuario,
      partnerNombre: myNombre,
      partnerGenero: String(myData.genero || ""),
      partneredAt: ts,
    });

    // borrar request
    tx.delete(db.doc(`users/${uid}/partnerRequests/${fromUid}`));
  });

  return { ok: true };
});

exports.breakPartnerRelationship = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) throw new HttpsError("failed-precondition", "Tu perfil no existe.");

  const user = userDoc.data() || {};
  const partnerUid = user.partnerUid;

  // Si no hay partner, no hacemos nada pero respondemos OK
  if (!partnerUid) return { ok: true, removed: false };

  const partnerRef = db.collection("users").doc(partnerUid);

  const groupId = user.groupId;

  const batch = db.batch();

  const del = admin.firestore.FieldValue.delete();

  // Limpia mi doc
  batch.update(userRef, {
    partnerUid: del,
    partnerUsuario: del,
    partnerNombre: del,
    partnerGenero: del,
    partneredAt: del,

    groupId: del,
    group: del,
    groupCreatedAt: del,
  });

  // Limpia doc partner
  batch.update(partnerRef, {
    partnerUid: del,
    partnerUsuario: del,
    partnerNombre: del,
    partnerGenero: del,
    partneredAt: del,

    groupId: del,
    group: del,
    groupCreatedAt: del,
  });

  // Si hay grupo, borrar subcolecciones y el grupo
  if (groupId) {
    const groupRef = db.collection("groups").doc(groupId);

    // Ojo: batch tiene límite 500 ops. Para tu caso inicial está bien.
    const eventsSnap = await groupRef.collection("events").get();
    eventsSnap.forEach((d) => batch.delete(d.ref));

    const savingsSnap = await groupRef.collection("savings").get();
    savingsSnap.forEach((d) => batch.delete(d.ref));

    const requestsSnap = await groupRef.collection("requests").get();
    requestsSnap.forEach((d) => batch.delete(d.ref));

    batch.delete(groupRef);
  }

  await batch.commit();
  return { ok: true, removed: true };
});