import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, push, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB6xCUlF2v82dzh-RkT0vqnEB6CB1X4h6g",
  authDomain: "logistics-edi.firebaseapp.com",
  databaseURL: "https://logistics-edi-default-rtdb.firebaseio.com",
  projectId: "logistics-edi",
  storageBucket: "logistics-edi.firebasestorage.app",
  messagingSenderId: "439719089962",
  appId: "1:439719089962:web:5c4457d52d2fe402327053",
  measurementId: "G-XWM0Q2K529"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export { ref, onValue, push, update };
