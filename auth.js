// Configurazione - usa config.js per API_BASE (aggiorna per deploy ngrok/produzione)
const API_BASE = (window.ATLAS_CONFIG && window.ATLAS_CONFIG.API_BASE) || "http://localhost:8000";

// Inizializzazione
document.addEventListener("DOMContentLoaded", () => {
  initAuthTabs();
  initLoginForm();
  initSignupForm();
  
  // Verifica se già autenticato
  checkAuth();
});

async function checkAuth() {
  const token = localStorage.getItem("token");
  if (!token) {
    return; // Non autenticato, resta sulla pagina di login
  }
  
  try {
    // Verifica se il token è valido
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (res.ok) {
      // Token valido, reindirizza all'app
      const userData = await res.json();
      console.log("Utente già autenticato:", userData.username);
      window.location.href = "index.html";
    } else {
      // Token non valido, rimuovilo
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  } catch (error) {
    // Errore di connessione - potrebbe essere che il server non sia avviato
    // Non rimuoviamo il token, l'utente può provare a connettersi
    console.log("Server non raggiungibile, resta sulla pagina di login");
  }
}

function initAuthTabs() {
  const tabs = document.querySelectorAll(".auth-tab");
  const forms = document.querySelectorAll(".auth-form");
  if (!tabs.length || !forms.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      
      // Rimuovi active da tutti
      tabs.forEach(t => t.classList.remove("active"));
      forms.forEach(f => f.classList.remove("active"));
      
      // Aggiungi active a quello selezionato
      tab.classList.add("active");
      document.getElementById(`${tabName}-form`).classList.add("active");
      
      // Pulisci messaggi
      hideMessages();
    });
  });
}

function initLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-btn");
    
    // Validazione base
    if (!username) {
      showError("Inserisci username");
      return;
    }
    
    if (!password) {
      showError("Inserisci password");
      return;
    }
    
    btn.disabled = true;
    btn.textContent = "Accesso in corso...";
    hideMessages();
    
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      
      // Leggi sempre il testo prima, poi parsalo come JSON se necessario
      const text = await res.text();
      let data;
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch (jsonError) {
          // Se la risposta dovrebbe essere JSON ma non lo è
          throw new Error(`Errore server: ${res.status} ${res.statusText}. ${text.substring(0, 100)}`);
        }
      } else {
        // Risposta non è JSON
        throw new Error(`Errore server: ${res.status} ${res.statusText}. ${text.substring(0, 100)}`);
      }
      
      if (!res.ok) {
        throw new Error(getErrorMessage(data, res.status, res.statusText));
      }
      
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      showSuccess("Accesso effettuato. Reindirizzamento...");
      
      // Reindirizza all'app dopo 1 secondo
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
      
    } catch (error) {
      console.error("Errore login:", error);
      const errorMsg = error.message || "Errore durante il login. Verifica username e password.";
      showError(errorMsg);
      btn.disabled = false;
      btn.textContent = "Accedi";
    }
  });
}

function initSignupForm() {
  const form = document.getElementById("signup-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const btn = document.getElementById("signup-btn");
    
    // Validazione base
    if (!username || username.length < 3) {
      showError("Username deve essere di almeno 3 caratteri");
      return;
    }
    
    if (!email || !email.includes("@")) {
      showError("Email non valida");
      return;
    }
    
    if (!password || password.length < 6) {
      showError("Password deve essere di almeno 6 caratteri");
      return;
    }
    
    btn.disabled = true;
    btn.textContent = "Creazione account...";
    hideMessages();
    
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, email, password })
      });
      
      // Leggi sempre il testo prima, poi parsalo come JSON se necessario
      const text = await res.text();
      let data;
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch (jsonError) {
          // Se la risposta dovrebbe essere JSON ma non lo è
          throw new Error(`Errore server: ${res.status} ${res.statusText}. ${text.substring(0, 100)}`);
        }
      } else {
        // Risposta non è JSON
        throw new Error(`Errore server: ${res.status} ${res.statusText}. ${text.substring(0, 100)}`);
      }
      
      if (!res.ok) {
        throw new Error(getErrorMessage(data, res.status, res.statusText));
      }
      
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      showSuccess("Account creato. Reindirizzamento...");
      
      // Reindirizza all'app dopo 1 secondo
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
      
    } catch (error) {
      console.error("Errore signup:", error);
      const errorMsg = error.message || "Errore durante la registrazione. Verifica che il server sia avviato.";
      showError(errorMsg);
      btn.disabled = false;
      btn.textContent = "Crea account";
    }
  });
}

function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message;
  errorDiv.classList.add("show");
  
  const successDiv = document.getElementById("success-message");
  successDiv.classList.remove("show");
}

function showSuccess(message) {
  const successDiv = document.getElementById("success-message");
  successDiv.textContent = message;
  successDiv.classList.add("show");
  
  const errorDiv = document.getElementById("error-message");
  errorDiv.classList.remove("show");
}

function hideMessages() {
  document.getElementById("error-message").classList.remove("show");
  document.getElementById("success-message").classList.remove("show");
}

function getErrorMessage(data, status, statusText) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d.message || "").filter(Boolean).join(". ") || statusText;
  return data?.message || `Errore ${status}`;
}

