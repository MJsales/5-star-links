const firebaseConfig = {
  apiKey: "AIzaSyC_BsfYnXeSCv5oNnAVS2xR0UKRhZNaBj4",
  authDomain: "starlinks-124a3.firebaseapp.com",
  projectId: "starlinks-124a3",
  storageBucket: "starlinks-124a3.firebasestorage.app",
  messagingSenderId: "478920640373",
  appId: "1:478920640373:web:7eafcdef45f0d7c334753c",
  measurementId: "G-BYF34LLMB9"
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let firebaseReady = false;

async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
    firebaseReady = true;

    onAuthStateChanged(firebaseAuth, (user) => {
      currentUser = user;
      updateAuthUI();
      if (user) syncFromCloud();
    });
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}

function updateAuthUI() {
  const authBtns = document.querySelectorAll('[id="authBtn"]');
  authBtns.forEach(authBtn => {
    if (currentUser) {
      authBtn.textContent = currentUser.displayName || currentUser.email.split('@')[0];
      authBtn.onclick = handleSignOut;
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.onclick = showAuthModal;
    }
  });
}

async function syncFromCloud() {
  if (!currentUser || !firebaseReady) return;
  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const docRef = doc(firebaseDb, 'users', currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.cart) localStorage.setItem('cart', JSON.stringify(data.cart));
      if (data.purchasedItems) localStorage.setItem('purchasedItems', JSON.stringify(data.purchasedItems));
    }
  } catch (e) { console.error('Sync error:', e); }
}

async function syncToCloud() {
  if (!currentUser || !firebaseReady) return;
  try {
    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const docRef = doc(firebaseDb, 'users', currentUser.uid);
    await setDoc(docRef, {
      cart: JSON.parse(localStorage.getItem('cart') || '[]'),
      purchasedItems: JSON.parse(localStorage.getItem('purchasedItems') || '[]'),
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (e) { console.error('Sync error:', e); }
}

async function handleSignUp(name, email, password) {
  if (!firebaseReady) throw new Error('Firebase not ready. Try again.');
  const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(cred.user, { displayName: name });
  updateAuthUI();
  await syncToCloud();
  return cred;
}

async function handleSignIn(email, password) {
  if (!firebaseReady) throw new Error('Firebase not ready. Try again.');
  const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  updateAuthUI();
  await syncFromCloud();
  return cred;
}

async function handleSignOut() {
  if (!firebaseReady) return;
  const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  await syncToCloud();
  await signOut(firebaseAuth);
  currentUser = null;
  updateAuthUI();
}

function showAuthModal() {
  document.getElementById('authOverlay').classList.add('active');
}

function hideAuthModal() {
  document.getElementById('authOverlay').classList.remove('active');
}

window.authModule = {
  getCurrentUser: () => currentUser,
  signUp: handleSignUp,
  signIn: handleSignIn,
  signOut: handleSignOut,
  showAuth: showAuthModal,
  hideAuth: hideAuthModal,
  syncToCloud
};

initFirebase();
