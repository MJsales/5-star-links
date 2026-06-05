import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyC_BsfYnXeSCv5oNnAVS2xR0UKRhZNaBj4",
  authDomain: "starlinks-124a3.firebaseapp.com",
  projectId: "starlinks-124a3",
  storageBucket: "starlinks-124a3.firebasestorage.app",
  messagingSenderId: "478920640373",
  appId: "1:478920640373:web:7eafcdef45f0d7c334753c",
  measurementId: "G-BYF34LLMB9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUI();
  if (user) syncFromCloud();
});

function updateAuthUI() {
  const authBtn = document.getElementById('authBtn');
  if (!authBtn) return;
  if (currentUser) {
    authBtn.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    authBtn.onclick = handleSignOut;
  } else {
    authBtn.textContent = 'Sign In';
    authBtn.onclick = showAuthModal;
  }
}

async function syncFromCloud() {
  if (!currentUser) return;
  try {
    const docRef = doc(db, 'users', currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.cart) localStorage.setItem('cart', JSON.stringify(data.cart));
      if (data.purchasedItems) localStorage.setItem('purchasedItems', JSON.stringify(data.purchasedItems));
    }
  } catch (e) { console.error('Sync error:', e); }
}

async function syncToCloud() {
  if (!currentUser) return;
  try {
    const docRef = doc(db, 'users', currentUser.uid);
    await setDoc(docRef, {
      cart: JSON.parse(localStorage.getItem('cart') || '[]'),
      purchasedItems: JSON.parse(localStorage.getItem('purchasedItems') || '[]'),
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (e) { console.error('Sync error:', e); }
}

async function handleSignUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  updateAuthUI();
  await syncToCloud();
  return cred;
}

async function handleSignIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  updateAuthUI();
  await syncFromCloud();
  return cred;
}

async function handleSignOut() {
  await syncToCloud();
  await signOut(auth);
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
