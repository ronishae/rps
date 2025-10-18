// --- Firebase Initialization and Service Exposure ---

// Import configuration from the private file
import { APP_ID, FIREBASE_CONFIG, RECAPTCHA_SITE_KEY } from './config.js';

// Firebase function imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

// Use the imported configuration variables
const appId = APP_ID;
const firebaseConfig = FIREBASE_CONFIG; 
let app, auth, db;

try {
    // Initialize Firebase App
    app = initializeApp(firebaseConfig);
    
    // Initialize App Check (Blocking bots)
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true 
    });

    // Initialize services
    auth = getAuth(app);
    db = getFirestore(app);

    // Expose services and functions globally for script.js
    window.db = db;
    window.auth = auth;
    window.appId = appId;
    window.doc = doc;
    window.setDoc = setDoc;
    window.onSnapshot = onSnapshot;
    window.updateDoc = updateDoc;
    window.deleteDoc = deleteDoc;
    window.deleteField = deleteField; // For potential cleanup logic
    
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

// Auth setup: Automatically signs in the user anonymously if not already signed in.
onAuthStateChanged(auth, (user) => {
    if (!user) {
        signInAnonymously(auth).catch(error => {
            console.error("Firebase Anonymous Auth Error:", error);
        });
    }
});
