const firebaseConfig = {
  apiKey: "AIzaSyC_BsfYnXeSCv5oNnAVS2xR0UKRhZNaBj4",
  authDomain: "starlinks-124a3.firebaseapp.com",
  projectId: "starlinks-124a3",
  storageBucket: "starlinks-124a3.firebasestorage.app",
  messagingSenderId: "478920640373",
  appId: "1:478920640373:web:7eafcdef45f0d7c334753c",
  measurementId: "G-BYF34LLMB9"
};

let currentUser = null;

function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    auth.onAuthStateChanged(function(user) {
      currentUser = user;
      updateAuthUI();
      if (user) syncFromCloud(auth, db);
    });

    window._fbAuth = auth;
    window._fbDb = db;
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}

function updateAuthUI() {
  var authBtns = document.querySelectorAll('[id="authBtn"]');
  authBtns.forEach(function(authBtn) {
    if (currentUser) {
      authBtn.textContent = currentUser.displayName || currentUser.email.split('@')[0];
      authBtn.onclick = handleSignOut;
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.onclick = showAuthModal;
    }
  });
}

function syncFromCloud(auth, db) {
  if (!currentUser) return;
  db.collection('users').doc(currentUser.uid).get().then(function(doc) {
    if (doc.exists) {
      var data = doc.data();
      if (data.cart) localStorage.setItem('cart', JSON.stringify(data.cart));
      if (data.purchasedItems) localStorage.setItem('purchasedItems', JSON.stringify(data.purchasedItems));
    }
  }).catch(function(e) { console.error('Sync error:', e); });
}

function syncToCloud() {
  if (!currentUser || !window._fbDb) return;
  return window._fbDb.collection('users').doc(currentUser.uid).set({
    cart: JSON.parse(localStorage.getItem('cart') || '[]'),
    purchasedItems: JSON.parse(localStorage.getItem('purchasedItems') || '[]'),
    lastUpdated: new Date().toISOString()
  }, { merge: true }).catch(function(e) { console.error('Sync error:', e); });
}

function saveOrder(orderItems) {
  if (!currentUser || !window._fbDb) return Promise.resolve();
  var order = {
    id: 'ORD-' + Date.now(),
    items: orderItems,
    date: new Date().toISOString(),
    total: orderItems.length * 5
  };
  return window._fbDb.collection('users').doc(currentUser.uid).collection('orders').doc(order.id).set(order)
    .then(function() {
      return syncToCloud();
    }).catch(function(e) { console.error('Save order error:', e); });
}

function getOrders() {
  if (!currentUser || !window._fbDb) return Promise.resolve([]);
  return window._fbDb.collection('users').doc(currentUser.uid).collection('orders').orderBy('date', 'desc').get()
    .then(function(snapshot) {
      var orders = [];
      snapshot.forEach(function(doc) { orders.push(doc.data()); });
      return orders;
    }).catch(function(e) { console.error('Get orders error:', e); return []; });
}

function handleSignUp(name, email, password) {
  localStorage.setItem('savedEmail', email);
  return firebase.auth().createUserWithEmailAndPassword(email, password).then(function(cred) {
    return cred.user.updateProfile({ displayName: name }).then(function() {
      updateAuthUI();
      return syncToCloud().then(function() { return cred; });
    });
  });
}

function handleSignIn(email, password) {
  localStorage.setItem('savedEmail', email);
  return firebase.auth().signInWithEmailAndPassword(email, password).then(function(cred) {
    updateAuthUI();
    syncFromCloud(window._fbAuth, window._fbDb);
    return cred;
  });
}

function handleSignOut() {
  return syncToCloud().then(function() {
    return firebase.auth().signOut();
  }).then(function() {
    currentUser = null;
    updateAuthUI();
  });
}

function showAuthModal() {
  document.getElementById('authOverlay').classList.add('active');
  setTimeout(fillEmailInputs, 100);
}

function hideAuthModal() {
  document.getElementById('authOverlay').classList.remove('active');
}

function getSavedEmail() {
  return localStorage.getItem('savedEmail') || '';
}

function fillEmailInputs() {
  var email = getSavedEmail();
  if (email) {
    var overlay = document.getElementById('authOverlay');
    if (overlay) {
      var emailInput = overlay.querySelector('#authEmail');
      if (emailInput) emailInput.value = email;
    }
  }
}

window.authModule = {
  getCurrentUser: function() { return currentUser; },
  signUp: handleSignUp,
  signIn: handleSignIn,
  signOut: handleSignOut,
  showAuth: showAuthModal,
  hideAuth: hideAuthModal,
  syncToCloud: syncToCloud,
  saveOrder: saveOrder,
  getOrders: getOrders,
  getSavedEmail: getSavedEmail,
  fillEmailInputs: fillEmailInputs
};

initFirebase();
