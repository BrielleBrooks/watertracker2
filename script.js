// ===== Persistent Water Tracker with stats, midnight rollover & seamless animated waves + gentle bobbing =====
const ML_PER_LITER = 1000;
const ML_PER_OUNCE = 29.5735295625;

// Small helper to keep all stored values in whole milliliters
const roundMl = (n) => Math.round(Number(n) || 0);

// UI refs
const waterAmountEl   = document.getElementById('water-amount');
const goalProgressEl  = document.getElementById('goal-progress');
const wave1           = document.getElementById('wave1');
const wave2           = document.getElementById('wave2');

const settingsBtn     = document.querySelector('.settings-btn');
const settingsModal   = document.getElementById('settings-modal');
const closeSettingsBtn= document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

const unitSelect      = document.getElementById('unit-select');
const goalInput       = document.getElementById('goal-input');
const incrementInput  = document.getElementById('increment-input');
const increaseBtn     = document.getElementById('increase');
const decreaseBtn     = document.getElementById('decrease');

// Stats
const statsBtn        = document.querySelector('.stats-btn');
const statsModal      = document.getElementById('stats-modal');
const closeStatsBtn   = document.getElementById('close-stats');
const chartCanvas     = document.getElementById('statsChart');

const VIEWBOX_WIDTH   = 375;
const VIEWBOX_HEIGHT  = 375;

// State
let state = {
  unit: 'liters',
  goalMl: 2000,
  incrementMl: 250,
  currentMl: 0
};
const STORAGE_KEY       = 'water_tracker_v3';
const HISTORY_KEY       = 'water_history_ml_v1';
const LAST_DATE_KEY     = 'water_last_date';

let history = [];
let chart;

// ---------- helpers ----------
const todayKey = () => new Date().toISOString().slice(0,10);
const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0,10);
};

function mlToUnit(ml, unit){
  const m = Number(ml) || 0;
  switch(unit){
    case 'ml': return m;
    case 'oz': return m / ML_PER_OUNCE;
    default:   return m / ML_PER_LITER; // liters
  }
}
function unitToMl(val, unit){
  const v = Number(val) || 0;
  switch(unit){
    case 'ml': return roundMl(v);
    case 'oz': return roundMl(v * ML_PER_OUNCE);
    default:   return roundMl(v * ML_PER_LITER); // liters
  }
}

// Format for display
function fmt(val, unit){
  const n = Number(val) || 0;
  if (unit === 'ml' || unit === 'oz') return Math.round(n).toString();
  return (Math.round(n * 100) / 100).toString(); // liters
}

function save(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }
function load(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw){ state = Object.assign(state, JSON.parse(raw)); } }catch(e){} }

function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    history = Array.isArray(arr) ? arr : [];
  }catch(e){ history = []; }
}
function saveHistory(){ try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }catch(e){} }

// ---------- UI ----------
let currentWaterY = VIEWBOX_HEIGHT;
function updateUI(){
  const pct = Math.max(0, Math.min(1, state.goalMl > 0 ? state.currentMl / state.goalMl : 0));
  waterAmountEl.textContent = `${fmt(mlToUnit(state.currentMl, state.unit), state.unit)} ${state.unit}`;
  goalProgressEl.textContent = `${Math.round(pct * 100)}% of your goal`;
  currentWaterY = (1 - pct) * VIEWBOX_HEIGHT;
}

// ---------- Settings modal ----------
function openSettings(){
  unitSelect.value = state.unit;
  goalInput.value = fmt(mlToUnit(state.goalMl, state.unit), state.unit);
  incrementInput.value = fmt(mlToUnit(state.incrementMl, state.unit), state.unit);
  settingsModal.classList.remove('hidden');
}
function closeSettings(){ settingsModal.classList.add('hidden'); }

// ---------- Stats modal & chart ----------
function last7Labels(){
  return Array.from({length: 7}, (_,i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  });
}
function last7ValuesInUnit(){
  const map = new Map(history.map(r => [r.date, r.totalMl]));
  return Array.from({length:7}, (_,i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0,10);
    const ml = (key === todayKey()) ? state.currentMl : (map.get(key) || 0);
    return mlToUnit(ml, state.unit);
  });
}
function chartMaxY(){
  const goalU  = mlToUnit(state.goalMl, state.unit);
  const maxData = Math.max(...last7ValuesInUnit(), 0);
  const rawMax  = Math.max(goalU, maxData, 1);
  const step = rawMax / 4;
  const pow10 = Math.pow(10, Math.floor(Math.log10(step)));
  const niceStep = Math.ceil(step / pow10) * pow10;
  return niceStep * 4;
}
function updateChart(){
  if (!chartCanvas || typeof Chart === 'undefined') return;
  const labels = last7Labels();
  const data   = last7ValuesInUnit();
  const yMax   = chartMaxY();
  if (chart) chart.destroy();
  chart = new Chart(chartCanvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: state.unit, data, backgroundColor: '#FFFFFF', borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min:0, max:yMax, ticks:{ stepSize:yMax/4, color:'#bdbdbd' }, grid:{ color:'rgba(255,255,255,0.08)' } },
        x: { ticks:{ color:'#bdbdbd' }, grid:{ display:false } }
      },
      plugins: { legend: { labels: { color:'#fff' } } }
    }
  });
}
function openStats(){ statsModal.classList.remove('hidden'); updateChart(); }
function closeStats(){ statsModal.classList.add('hidden'); }

// ---------- Rollover (midnight) ----------
function rolloverIfNeededOnLoad(){
  const today = todayKey();
  const last  = localStorage.getItem(LAST_DATE_KEY);
  if (last && last !== today){
    history.push({date: last, totalMl: state.currentMl});
    saveHistory();
    state.currentMl = 0;
    save();
  }
  localStorage.setItem(LAST_DATE_KEY, today);
}
function scheduleMidnightRollover(){
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,0);
  const ms = midnight - now;
  setTimeout(() => {
    history.push({date: yesterdayKey(), totalMl: state.currentMl});
    saveHistory();
    state.currentMl = 0;
    save(); updateUI();
    localStorage.setItem(LAST_DATE_KEY, todayKey());
    updateChart();
    scheduleMidnightRollover();
  }, ms);
}

// ---------- Seamless wave builder ----------
const TWO_PI = Math.PI * 2;
const WAVE1_AMP    = 8;
const WAVE2_AMP    = 6;
const WAVE1_LAMBDA = 140;
const WAVE2_LAMBDA = 110;
const H_SPEED      = 0.025;
const BOB_SPEED    = 0.025;
const BOB_AMP      = 5;
const SAMPLE_STEP  = 6;
const XPAD         = 16;

function buildSineFill(phase, waterY, amp, lambda, step = SAMPLE_STEP, xPad = XPAD) {
  const k = TWO_PI / lambda;
  const maxX = VIEWBOX_WIDTH + xPad;
  let d = `M 0 ${VIEWBOX_HEIGHT} L 0 ${waterY}`;
  for (let x = 0; x <= maxX; x += step) {
    const y = waterY + amp * Math.sin(k * x + phase);
    d += ` L ${x} ${y}`;
  }
  d += ` L ${maxX} ${VIEWBOX_HEIGHT} Z`;
  return d;
}

// ---------- Animation loop ----------
let phase = 0;
let tBob  = 0;
function animate(){
  phase = (phase + H_SPEED) % TWO_PI;
  tBob  += BOB_SPEED;
  const bob = Math.sin(tBob) * BOB_AMP;
  const waterY = currentWaterY + bob;
  wave1.setAttribute('d', buildSineFill(phase,           waterY, WAVE1_AMP, WAVE1_LAMBDA));
  wave2.setAttribute('d', buildSineFill(phase + Math.PI, waterY, WAVE2_AMP, WAVE2_LAMBDA));
  requestAnimationFrame(animate);
}

// ---------- events ----------
increaseBtn.addEventListener('click', () => {
  state.currentMl = roundMl(state.currentMl + state.incrementMl);
  save(); updateUI(); updateChart();
});
decreaseBtn.addEventListener('click', () => {
  state.currentMl = Math.max(0, roundMl(state.currentMl - state.incrementMl));
  save(); updateUI(); updateChart();
});

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e)=>{ if(e.target === settingsModal) closeSettings(); });

statsBtn.addEventListener('click', openStats);
closeStatsBtn.addEventListener('click', closeStats);
statsModal.addEventListener('click', (e)=>{ if(e.target === statsModal) closeStats(); });

// ✅ Fixed: zero out only when the unit changes
saveSettingsBtn.addEventListener('click', () => {
  const prevUnit = state.unit;
  const newUnit = unitSelect.value;

  const goalVal = Number(goalInput.value) || 0;
  const incVal  = Number(incrementInput.value) || 0;

  // update unit
  state.unit = newUnit;

  // if unit changed → reset water meter
  if (newUnit !== prevUnit) {
    state.currentMl = 0;
  }

  // always update goal + increment
  state.goalMl      = Math.max(0, unitToMl(goalVal, newUnit));
  state.incrementMl = Math.max(1, unitToMl(incVal, newUnit));

  save(); closeSettings(); updateUI(); updateChart();
});

// ---------- init ----------
load();
loadHistory();
rolloverIfNeededOnLoad();
state.goalMl      = roundMl(state.goalMl);
state.incrementMl = Math.max(1, roundMl(state.incrementMl));
state.currentMl   = roundMl(state.currentMl);

updateUI();
scheduleMidnightRollover();
animate();
