// Configurazione - usa config.js per API_BASE (aggiorna per deploy ngrok/produzione)
const API_BASE = (window.ATLAS_CONFIG && window.ATLAS_CONFIG.API_BASE) || "http://localhost:8000";
let liveMatchInterval = null;
let currentTick = 0;
let availableProviders = {};

// ========== AUTENTICAZIONE ==========
function getAuthToken() {
  return localStorage.getItem("token");
}

function getAuthHeaders() {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

async function checkAuth() {
  const token = getAuthToken();
  if (!token) {
    // Non autenticato, reindirizza al login
    window.location.href = "auth.html";
    return false;
  }
  
  try {
    // Verifica token
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      // Token non valido
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "auth.html";
      return false;
    }
    
    const user = await res.json();
    
    // Mostra info utente
    const userInfo = document.getElementById("user-info");
    if (userInfo) {
      userInfo.textContent = `👤 ${user.username}`;
    }
    
    // Mostra app
    const appContainer = document.getElementById("app-container");
    const authRequired = document.getElementById("auth-required");
    if (appContainer) appContainer.style.display = "block";
    if (authRequired) authRequired.style.display = "none";
    
    return true;
  } catch (error) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "auth.html";
    return false;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "auth.html";
}

// ========== INIZIALIZZAZIONE ==========
document.addEventListener("DOMContentLoaded", async () => {
  // Verifica autenticazione prima di tutto
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return;
  }
  
  // Setup logout button
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
  
  initTabs();
  loadAvailableProviders(); // Carica provider disponibili
  initMatchControls();
  loadLeaderboard();
  loadCurrentPrompt();
  loadStats();
});

// ========== TAB NAVIGATION ==========
function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;

      // Rimuovi active da tutti
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      // Aggiungi active a quello selezionato
      btn.classList.add("active");
      document.getElementById(`${tabName}-tab`).classList.add("active");

      // Carica contenuto specifico
      if (tabName === "leaderboard") {
        loadLeaderboard();
      } else if (tabName === "prompts") {
        loadCurrentPrompt();
      } else if (tabName === "stats") {
        loadStats();
      }
    });
  });
}

// ========== PARTITA LIVE ==========
function initMatchControls() {
  document.getElementById("start-match").addEventListener("click", startLiveMatch);
  document.getElementById("reset-match").addEventListener("click", resetMatch);
}

async function startLiveMatch() {
  const team1 = document.getElementById("team1-select").value;
  const team2 = document.getElementById("team2-select").value;
  const useLLM = document.getElementById("use-llm").checked;

  try {
    // Reset partita (POST invece di GET)
    const resetRes = await fetch(`${API_BASE}/matches/reset?team1=${team1}&team2=${team2}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!resetRes.ok) {
      throw new Error("Errore nel reset della partita");
    }

    // Aggiorna nomi squadre
    document.getElementById("team1-name").textContent = getTeamName(team1);
    document.getElementById("team2-name").textContent = getTeamName(team2);
    
    showNotification("Partita avviata!", "success");
  } catch (error) {
    showNotification(`❌ Errore: ${error.message}`, "error");
    console.error("Errore avvio partita:", error);
    return;
  }

  // Avvia loop
  if (liveMatchInterval) {
    clearInterval(liveMatchInterval);
  }

  currentTick = 0;
  liveMatchInterval = setInterval(() => {
    updateLiveMatch(team1, team2, useLLM);
  }, 200); // Aggiorna ogni 200ms per movimento più fluido
}

async function loadAvailableProviders() {
  try {
    const res = await fetch(`${API_BASE}/providers`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    availableProviders = data.providers;
    
    // Aggiorna dropdown squadre
    updateTeamSelectors(data.providers, data.recommended_free || []);
    
    // Mostra notifica se Ollama è disponibile
    if (data.providers.ollama && data.providers.ollama.enabled) {
      showNotification(`✅ Ollama rilevato! Modello: ${data.providers.ollama.model}`, "success");
    }
  } catch (error) {
    console.error("Errore caricamento provider:", error);
    // Usa provider di default
    updateTeamSelectors({}, []);
  }
}

function updateTeamSelectors(providers, recommended) {
  const team1Select = document.getElementById("team1-select");
  const team2Select = document.getElementById("team2-select");
  
  if (!team1Select || !team2Select) return;
  
  // Pulisci opzioni esistenti
  team1Select.innerHTML = "";
  team2Select.innerHTML = "";
  
  // Aggiungi provider gratuiti prima
  const freeProviders = ["mock", "ollama", "groq", "huggingface"];
  const paidProviders = ["openai", "anthropic", "google"];
  
  // Provider gratuiti disponibili
  freeProviders.forEach(provider => {
    if (providers[provider] && providers[provider].enabled) {
      const option1 = document.createElement("option");
      const option2 = document.createElement("option");
      const name = providers[provider].name || provider;
      const model = providers[provider].model ? ` (${providers[provider].model})` : "";
      
      option1.value = provider;
      option1.textContent = `🆓 ${name}${model}`;
      option2.value = provider;
      option2.textContent = `🆓 ${name}${model}`;
      
      team1Select.appendChild(option1);
      team2Select.appendChild(option2);
    }
  });
  
  // Separatore
  if (freeProviders.some(p => providers[p]?.enabled) && paidProviders.some(p => providers[p]?.enabled)) {
    const sep1 = document.createElement("option");
    const sep2 = document.createElement("option");
    sep1.disabled = true;
    sep1.textContent = "──────────";
    sep2.disabled = true;
    sep2.textContent = "──────────";
    team1Select.appendChild(sep1);
    team2Select.appendChild(sep2);
  }
  
  // Provider a pagamento
  paidProviders.forEach(provider => {
    if (providers[provider] && providers[provider].enabled) {
      const option1 = document.createElement("option");
      const option2 = document.createElement("option");
      const name = providers[provider].name || provider;
      
      option1.value = provider;
      option1.textContent = `💰 ${name}`;
      option2.value = provider;
      option2.textContent = `💰 ${name}`;
      
      team1Select.appendChild(option1);
      team2Select.appendChild(option2);
    }
  });
  
  // Se nessun provider disponibile, usa mock
  if (team1Select.options.length === 0) {
    const option = document.createElement("option");
    option.value = "mock";
    option.textContent = "🆓 Mock AI (Sempre disponibile)";
    team1Select.appendChild(option);
    team2Select.appendChild(option.cloneNode(true));
  }
  
  // Imposta valori di default (primo gratuito disponibile)
  if (recommended.length > 0) {
    team1Select.value = recommended[0];
    team2Select.value = recommended.length > 1 ? recommended[1] : recommended[0];
  } else {
    team1Select.value = "mock";
    team2Select.value = "mock";
  }
}

function showNotification(message, type = "info") {
  // Crea notifica temporanea
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === "success" ? "#27ae60" : "#3498db"};
    color: white;
    border-radius: 5px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function getTeamName(provider) {
  if (availableProviders[provider]) {
    return availableProviders[provider].name || provider;
  }
  
  const names = {
    "openai": "GPT-4",
    "anthropic": "Claude",
    "google": "Gemini",
    "ollama": "Ollama",
    "groq": "Groq",
    "mock": "Mock AI",
    "huggingface": "Hugging Face"
  };
  return names[provider] || provider;
}

async function updateLiveMatch(team1, team2, useLLM) {
  try {
    const res = await fetch(`${API_BASE}/matches/live?team1=${team1}&team2=${team2}&tick=${currentTick}&use_llm=${useLLM}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();

    // Aggiorna score
    if (document.getElementById("score")) {
      document.getElementById("score").textContent = `${data.score[0]} - ${data.score[1]}`;
    }
    if (document.getElementById("minute")) {
      const minute = data.minute || 0;
      document.getElementById("minute").textContent = `${minute}/5`;
    }
    if (document.getElementById("tick")) {
      document.getElementById("tick").textContent = data.tick || 0;
    }

    // Aggiorna campo
    updateField(data);

    // Aggiorna eventi
    updateEvents(data.events || []);

    currentTick = data.tick;
    
    // Ferma se partita finita (5 minuti = 300 tick)
    if (data.tick >= 300) {
      if (liveMatchInterval) {
        clearInterval(liveMatchInterval);
        liveMatchInterval = null;
        showNotification("Partita finita!", "success");
      }
    }
  } catch (error) {
    console.error("Errore aggiornamento partita:", error);
    showNotification(`Errore: ${error.message}`, "error");
  }
}

function updateField(data) {
  const field = document.getElementById("field");
  if (!field) {
    console.error("Campo non trovato!");
    return;
  }

  // Rimuovi vecchi elementi
  [...field.querySelectorAll(".player, #ball")].forEach(el => el.remove());

  // Disegna giocatori (3 per squadra)
  if (data.agents && data.agents.length > 0) {
    data.agents.forEach(agent => {
      const player = document.createElement("div");
      player.className = `player team${agent.team} ${agent.role || 'midfielder'}`;
      if (agent.has_ball) {
        player.classList.add("has-ball");
      }
      // Converti coordinate (campo 100x60 -> display 800x480)
      player.style.left = (agent.x / 100 * 800) + "px";
      player.style.top = (agent.y / 60 * 480) + "px";
      player.title = `${agent.role || 'player'} - Team ${agent.team + 1}`;
      field.appendChild(player);
    });
  }

  // Disegna palla
  if (data.ball) {
    const ball = document.createElement("div");
    ball.id = "ball";
    ball.style.left = (data.ball.x / 100 * 800) + "px";
    ball.style.top = (data.ball.y / 60 * 480) + "px";
    field.appendChild(ball);
  }
}

function updateEvents(events) {
  const eventsList = document.getElementById("events-list");
  eventsList.innerHTML = "";

  // Mostra solo ultimi 10 eventi
  const recentEvents = events.slice(-10).reverse();

  recentEvents.forEach(event => {
    const eventDiv = document.createElement("div");
    eventDiv.className = `event-item ${event.type}`;
    
    let text = "";
    if (event.type === "goal") {
      text = `⚽ GOL! Minuto ${event.minute} - Team ${event.team}`;
    } else if (event.type === "foul") {
      text = `🟨 Fallo - Minuto ${event.minute}`;
    }
    
    eventDiv.textContent = text;
    eventsList.appendChild(eventDiv);
  });
}

async function resetMatch() {
  if (liveMatchInterval) {
    clearInterval(liveMatchInterval);
    liveMatchInterval = null;
  }

  const team1 = document.getElementById("team1-select").value;
  const team2 = document.getElementById("team2-select").value;

  try {
    const resetRes = await fetch(`${API_BASE}/matches/reset?team1=${team1}&team2=${team2}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!resetRes.ok) {
      throw new Error("Errore nel reset");
    }
    currentTick = 0;
    updateLiveMatch(team1, team2, false);
    showNotification("Partita resettata!", "success");
  } catch (error) {
    console.error("Errore reset:", error);
    showNotification(`Errore reset: ${error.message}`, "error");
  }
}

// ========== CLASSIFICA ==========
async function loadLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/leaderboard?limit=20`, {
      headers: getAuthHeaders()
    });
    const leaderboard = await res.json();

    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    leaderboard.forEach((team, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${team.name}</strong></td>
        <td>${team.points}</td>
        <td>${team.matches}</td>
        <td>${team.wins}</td>
        <td>${team.draws}</td>
        <td>${team.losses}</td>
        <td>${team.goals_for}</td>
        <td>${team.goals_against}</td>
        <td>${team.goal_difference > 0 ? '+' : ''}${team.goal_difference}</td>
      `;
      tbody.appendChild(row);
    });

    // Carica partite recenti
    loadRecentMatches();
  } catch (error) {
    console.error("Errore caricamento classifica:", error);
  }
}

async function loadRecentMatches() {
  try {
    const res = await fetch(`${API_BASE}/matches/recent?limit=10`, {
      headers: getAuthHeaders()
    });
    const matches = await res.json();

    const matchesList = document.getElementById("matches-list");
    matchesList.innerHTML = "";

    matches.forEach(match => {
      const matchDiv = document.createElement("div");
      matchDiv.className = "match-item";
      matchDiv.innerHTML = `
        <div>
          <strong>${match.team1}</strong> vs <strong>${match.team2}</strong>
          <span style="margin-left: 15px; color: #666;">Settimana ${match.week}</span>
        </div>
        <div style="font-size: 1.2em; font-weight: bold; color: #667eea;">
          ${match.score}
        </div>
      `;
      matchesList.appendChild(matchDiv);
    });
  } catch (error) {
    console.error("Errore caricamento partite:", error);
  }
}

// Simula una settimana di partite
document.getElementById("simulate-week")?.addEventListener("click", async () => {
  const button = document.getElementById("simulate-week");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Simulazione in corso...";
  
  try {
    // Ottieni tutte le squadre disponibili
    const providersRes = await fetch(`${API_BASE}/providers`, {
      headers: getAuthHeaders()
    });
    const providersData = await providersRes.json();
    const availableTeams = Object.keys(providersData.providers).filter(
      p => providersData.providers[p].enabled || p === "mock"
    );
    
    if (availableTeams.length < 2) {
      showNotification("Serve almeno 2 squadre disponibili!", "error");
      return;
    }
    
    let matchesPlayed = 0;
    const totalMatches = (availableTeams.length * (availableTeams.length - 1)) / 2;
    
    // Simula tutte le combinazioni
    for (let i = 0; i < availableTeams.length; i++) {
      for (let j = i + 1; j < availableTeams.length; j++) {
        try {
          const res = await fetch(
            `${API_BASE}/matches/simulate?team1=${availableTeams[i]}&team2=${availableTeams[j]}&use_llm=false`,
            {
              method: 'POST',
              headers: getAuthHeaders()
            }
          );
          if (res.ok) {
            matchesPlayed++;
            button.textContent = `Simulazione... ${matchesPlayed}/${totalMatches}`;
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Pausa tra partite
        } catch (error) {
          console.error(`Errore simulazione ${availableTeams[i]} vs ${availableTeams[j]}:`, error);
        }
      }
    }

    loadLeaderboard();
    showNotification(`✅ Settimana simulata! ${matchesPlayed} partite giocate.`, "success");
  } catch (error) {
    console.error("Errore simulazione settimana:", error);
    showNotification(`Errore: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

document.getElementById("refresh-leaderboard")?.addEventListener("click", loadLeaderboard);

// ========== PROMPT SETTIMANALI ==========
async function loadCurrentPrompt() {
  try {
    const res = await fetch(`${API_BASE}/prompts/current`, {
      headers: getAuthHeaders()
    });
    const prompt = await res.json();

    document.getElementById("prompt-category").textContent = prompt.category;
    document.getElementById("prompt-week").textContent = `Settimana ${prompt.week}`;
    document.getElementById("prompt-text").textContent = prompt.prompt;

    // Carica classifica prompt
    if (prompt.id) {
      loadPromptLeaderboard(prompt.id);
    }
  } catch (error) {
    console.error("Errore caricamento prompt:", error);
    document.getElementById("prompt-text").textContent = "Errore nel caricamento del prompt.";
  }
}

async function loadPromptLeaderboard(promptId) {
  try {
    const res = await fetch(`${API_BASE}/prompts/${promptId}/leaderboard`, {
      headers: getAuthHeaders()
    });
    const leaderboard = await res.json();

    const tbody = document.getElementById("prompt-leaderboard-body");
    tbody.innerHTML = "";

    if (leaderboard.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4' style='text-align: center; padding: 20px;'>Nessuna risposta ancora</td></tr>";
      return;
    }

    leaderboard.forEach((entry, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.ranking || index + 1}</td>
        <td><strong>${entry.team}</strong></td>
        <td>${entry.score.toFixed(1)}</td>
        <td>${new Date(entry.submitted_at).toLocaleDateString()}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error("Errore caricamento classifica prompt:", error);
  }
}

// Invia risposta LLM (semplificato - in produzione userebbe API key)
document.getElementById("submit-response")?.addEventListener("click", async () => {
  const promptText = document.getElementById("prompt-text").textContent;
  if (!promptText || promptText === "Caricamento...") {
    alert("Nessun prompt disponibile");
    return;
  }

  // Per ora: simula invio (in produzione chiamerebbe LLM API)
  alert("Funzionalità di invio risposta LLM richiede integrazione con API keys. Implementa in backend con autenticazione.");
});

// ========== STATISTICHE ==========
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/stats/overview`, {
      headers: getAuthHeaders()
    });
    const stats = await res.json();

    document.getElementById("total-matches").textContent = stats.total_matches || 0;
    document.getElementById("total-teams").textContent = stats.total_teams || 0;
    document.getElementById("total-prompts").textContent = stats.total_prompts || 0;
    document.getElementById("current-week").textContent = stats.current_week || 1;
  } catch (error) {
    console.error("Errore caricamento statistiche:", error);
  }
}
