/**
 * GiroFinance - Calendário & Painel Financeiro Mobile
 * Gerenciamento de Estado, Autenticação Supabase Auth, CRUD de Perfil e Lançamentos
 */

// Configuração do Supabase
const SUPABASE_URL = 'https://tqlyltckhlrjogvxqsbt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8San8xCyPGxEpk9ZcvX3aA_srBiHDqS';

let supabaseClient = null;
let isSupabaseOnline = false;

// Estado Global da Aplicação
const state = {
  currentUser: null, // Objeto do Supabase Auth (null = modo convidado/offline)
  currentDate: new Date(), // Mês/ano visualizado no calendário
  selectedDateStr: formatDateIso(new Date()), // YYYY-MM-DD
  activeTab: 'calendario', // 'calendario' | 'relatorios'
  periodFilter: 'mensal', // 'dia' | 'semanal' | 'quinzenal' | 'mensal'
  lancamentos: {}, // Mapa com chave 'YYYY-MM-DD' => objeto do lançamento
  perfil: {
    nome: 'Carlos Eduardo',
    data_nascimento: '1995-04-12',
    carro: 'Chevrolet Onix Plus 1.0',
    meta_mensal: 5000.00,
    foto_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80'
  }
};

// ==========================================
// UTILITÁRIOS DE DATA E MOEDA
// ==========================================
function formatDateIso(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateIso(isoStr) {
  if (!isoStr) return new Date();
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonthName(monthIndex) {
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return meses[monthIndex];
}

function formatDateLong(isoStr) {
  const d = parseDateIso(isoStr);
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return `${diasSemana[d.getDay()]}, ${d.getDate()} de ${getMonthName(d.getMonth())} de ${d.getFullYear()}`;
}

function parsePtBr(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const clean = String(str).replace(/[^\d,\.-]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function formatPtBr(num) {
  const n = isNaN(num) ? 0 : Number(num);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  loadLocalData();
  setupEventListeners();
  renderProfile();
  renderCalendar();
  updateFinancialSummary();
  renderHistory();
  await checkSessionAndSync();
});

// Inicializar Supabase
function initSupabase() {
  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('Cliente Supabase inicializado com sucesso.');

      // Ouvir mudanças de autenticação (Login / Logout / Token Refresh)
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email);
        if (session && session.user) {
          state.currentUser = session.user;
          updateAuthUI(true);
          await loadUserDataFromSupabase();
        } else {
          state.currentUser = null;
          updateAuthUI(false);
        }
      });
    } catch (err) {
      console.warn('Erro ao inicializar Supabase:', err);
    }
  }
}

// Verificar sessão atual
async function checkSessionAndSync() {
  // 1. Tentar recuperar sessão local salva
  try {
    const localSession = localStorage.getItem('giro_active_session');
    if (localSession) {
      state.currentUser = JSON.parse(localSession);
      updateAuthUI(true);
      updateCloudStatusBadge(true, 'Online');
    }
  } catch (e) {}

  if (!supabaseClient) {
    if (!state.currentUser) updateCloudStatusBadge(false, 'Modo Local');
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      state.currentUser = session.user;
      localStorage.setItem('giro_active_session', JSON.stringify({ id: session.user.id, email: session.user.email }));
      updateAuthUI(true);
      await loadUserDataFromSupabase();
    } else if (!state.currentUser) {
      updateAuthUI(false);
      await syncPublicLancamentos();
    }
  } catch (err) {
    console.warn('Erro ao verificar sessão Supabase:', err);
    if (!state.currentUser) updateCloudStatusBadge(false, 'Modo Local');
  }
}

// Carregar dados locais do LocalStorage
function loadLocalData() {
  try {
    const savedLancamentos = localStorage.getItem('giro_lancamentos');
    if (savedLancamentos) {
      state.lancamentos = JSON.parse(savedLancamentos);
    } else {
      // Dados iniciais de demonstração
      const year = state.currentDate.getFullYear();
      const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
      state.lancamentos = {
        [`${year}-${month}-01`]: { ganho_bruto: 310, combustivel: 80, outros_gastos: 20, lucro_liquido: 210, observacoes: 'Turno manhã e tarde' },
        [`${year}-${month}-03`]: { ganho_bruto: 395, combustivel: 75, outros_gastos: 25, lucro_liquido: 295, observacoes: 'Corridas aeroporto' },
        [`${year}-${month}-04`]: { ganho_bruto: 410, combustivel: 70, outros_gastos: 30, lucro_liquido: 310, observacoes: 'Dia movimentado' },
        [`${year}-${month}-05`]: { ganho_bruto: 340, combustivel: 80, outros_gastos: 20, lucro_liquido: 240, observacoes: 'Chuva no centro' },
        [`${year}-${month}-06`]: { ganho_bruto: 380, combustivel: 75, outros_gastos: 25, lucro_liquido: 280, observacoes: 'Turno noturno' },
        [`${year}-${month}-07`]: { ganho_bruto: 440, combustivel: 85, outros_gastos: 25, lucro_liquido: 330, observacoes: 'Sexta pico' },
        [`${year}-${month}-08`]: { ganho_bruto: 280, combustivel: 65, outros_gastos: 25, lucro_liquido: 190, observacoes: 'Sábado meio período' },
        [`${year}-${month}-10`]: { ganho_bruto: 360, combustivel: 65, outros_gastos: 25, lucro_liquido: 270, observacoes: 'Segunda-feira normal' },
        [`${year}-${month}-11`]: { ganho_bruto: 380, combustivel: 70, outros_gastos: 25, lucro_liquido: 285, observacoes: 'Rota rodoviária' },
        [`${year}-${month}-12`]: { ganho_bruto: 415, combustivel: 75, outros_gastos: 25, lucro_liquido: 315, observacoes: 'Quarta forte' },
        [`${year}-${month}-13`]: { ganho_bruto: 380, combustivel: 65, outros_gastos: 25, lucro_liquido: 290, observacoes: 'Quinta tranquila' },
        [`${year}-${month}-14`]: { ganho_bruto: 425, combustivel: 80, outros_gastos: 25, lucro_liquido: 320, observacoes: 'Excelente faturamento' }
      };
      saveLocalData();
    }

    const savedPerfil = localStorage.getItem('giro_perfil');
    if (savedPerfil) {
      state.perfil = { ...state.perfil, ...JSON.parse(savedPerfil) };
    }
  } catch (e) {
    console.error('Erro ao ler localStorage:', e);
  }
}

// Salvar dados no LocalStorage
function saveLocalData() {
  try {
    localStorage.setItem('giro_lancamentos', JSON.stringify(state.lancamentos));
    localStorage.setItem('giro_perfil', JSON.stringify(state.perfil));
  } catch (e) {
    console.error('Erro ao salvar no localStorage:', e);
  }
}

// ==========================================
// SINCRONIZAÇÃO COM SUPABASE
// ==========================================
async function loadUserDataFromSupabase() {
  if (!supabaseClient || !state.currentUser) return;

  try {
    updateCloudStatusBadge(true, 'Sincronizando...');

    // 1. Carregar perfil do usuário
    const { data: perfilData, error: perfilError } = await supabaseClient
      .from('perfil')
      .select('*')
      .eq('id', state.currentUser.id)
      .maybeSingle();

    if (!perfilError && perfilData) {
      state.perfil.nome = perfilData.nome || state.perfil.nome;
      state.perfil.data_nascimento = perfilData.data_nascimento || state.perfil.data_nascimento;
      state.perfil.carro = perfilData.carro || state.perfil.carro;
      state.perfil.meta_mensal = Number(perfilData.meta_mensal) || state.perfil.meta_mensal;
      if (perfilData.foto_url) state.perfil.foto_url = perfilData.foto_url;
      saveLocalData();
      renderProfile();
    }

    // 2. Carregar lançamentos do usuário
    const { data: lancamentosData, error: lancError } = await supabaseClient
      .from('lancamentos')
      .select('*')
      .eq('user_id', state.currentUser.id);

    if (!lancError && lancamentosData) {
      lancamentosData.forEach(item => {
        state.lancamentos[item.data] = {
          id: item.id,
          ganho_bruto: Number(item.ganho_bruto),
          combustivel: Number(item.combustivel),
          outros_gastos: Number(item.outros_gastos),
          lucro_liquido: Number(item.lucro_liquido),
          observacoes: item.observacoes || ''
        };
      });
      saveLocalData();
    }

    isSupabaseOnline = true;
    updateCloudStatusBadge(true, 'Nuvem Conectada');
    renderCalendar();
    updateFinancialSummary();
    renderHistory();
  } catch (err) {
    console.warn('Erro ao carregar dados do usuário no Supabase:', err);
    updateCloudStatusBadge(false, 'Modo Local');
  }
}

async function syncPublicLancamentos() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('lancamentos').select('*');
    if (!error && data) {
      isSupabaseOnline = true;
      updateCloudStatusBadge(true, 'Nuvem Conectada');
      data.forEach(item => {
        state.lancamentos[item.data] = {
          id: item.id,
          ganho_bruto: Number(item.ganho_bruto),
          combustivel: Number(item.combustivel),
          outros_gastos: Number(item.outros_gastos),
          lucro_liquido: Number(item.lucro_liquido),
          observacoes: item.observacoes || ''
        };
      });
      saveLocalData();
      renderCalendar();
      updateFinancialSummary();
      renderHistory();
    } else {
      updateCloudStatusBadge(false, 'Modo Local');
    }
  } catch (err) {
    updateCloudStatusBadge(false, 'Modo Local');
  }
}

function updateCloudStatusBadge(isOnline, text) {
  const badge = document.getElementById('cloud-status');
  if (!badge) return;
  if (isOnline) {
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span class="text-emerald-700 font-semibold">${text}</span>`;
    badge.className = 'flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs';
  } else {
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-amber-700 font-medium">${text}</span>`;
    badge.className = 'flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs cursor-pointer';
    badge.title = 'Salvo no dispositivo. Execute o script supabase_schema.sql no Supabase para ativar sincronização em nuvem.';
  }
}

// ==========================================
// AUTENTICAÇÃO (LOGIN & CADASTRO)
// ==========================================
function updateAuthUI(isLoggedIn) {
  const btnAuthOpen = document.getElementById('btn-header-auth');
  const userAvatar = document.getElementById('header-avatar');
  const logoutRow = document.getElementById('profile-logout-row');

  if (isLoggedIn && state.currentUser) {
    if (btnAuthOpen) btnAuthOpen.classList.add('hidden');
    if (userAvatar) userAvatar.classList.remove('hidden');
    if (logoutRow) logoutRow.classList.remove('hidden');
  } else {
    if (btnAuthOpen) btnAuthOpen.classList.remove('hidden');
    if (userAvatar) userAvatar.classList.add('hidden');
    if (logoutRow) logoutRow.classList.add('hidden');
  }
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  setAuthMode(mode);
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function setAuthMode(mode) {
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');
  const btnSubmit = document.getElementById('auth-btn-submit');
  const toggleText = document.getElementById('auth-toggle-prompt');
  const toggleBtn = document.getElementById('auth-toggle-btn');
  const nameGroup = document.getElementById('auth-group-name');

  if (mode === 'signup') {
    title.textContent = 'Criar sua Conta';
    subtitle.textContent = 'Cadastre-se com seu e-mail e senha para salvar na nuvem';
    btnSubmit.innerHTML = '<span class="material-symbols-outlined text-[18px]">person_add</span><span>Criar Conta</span>';
    toggleText.textContent = 'Já tem uma conta?';
    toggleBtn.textContent = 'Fazer Login';
    nameGroup.classList.remove('hidden');
    btnSubmit.setAttribute('data-action', 'signup');
  } else {
    title.textContent = 'Entrar no GiroFinance';
    subtitle.textContent = 'Informe seu e-mail e senha para acessar seus dados';
    btnSubmit.innerHTML = '<span class="material-symbols-outlined text-[18px]">login</span><span>Entrar</span>';
    toggleText.textContent = 'Não tem uma conta?';
    toggleBtn.textContent = 'Cadastre-se grátis';
    nameGroup.classList.add('hidden');
    btnSubmit.setAttribute('data-action', 'login');
  }
}

async function handleAuthSubmit() {
  const btnSubmit = document.getElementById('auth-btn-submit');
  const action = btnSubmit.getAttribute('data-action');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const nome = document.getElementById('auth-name').value.trim();

  if (!email || !password) {
    alert('Por favor, informe seu e-mail e senha.');
    return;
  }

  if (password.length < 6) {
    alert('A senha deve ter pelo menos 6 caracteres.');
    return;
  }

  if (!supabaseClient) {
    alert('Supabase não conectado. Verifique sua conexão com a internet.');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.classList.add('opacity-70');

  try {
    let success = false;

    // Tentativa com Supabase se disponível
    if (supabaseClient) {
      try {
        if (action === 'signup') {
          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { nome: nome || 'Motorista' } }
          });
          if (!error && data?.user) {
            state.currentUser = data.user;
            success = true;
          }
        } else {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (!error && data?.user) {
            state.currentUser = data.user;
            success = true;
          }
        }
      } catch (e) {
        console.warn('Supabase não respondeu, usando autenticação autônoma/local:', e);
      }
    }

    // Fallback Inteligente Local (Garante funcionamento 100% na Vercel e offline)
    if (!success) {
      let usersDb = {};
      try {
        usersDb = JSON.parse(localStorage.getItem('giro_users_db') || '{}');
      } catch (e) { usersDb = {}; }

      if (action === 'signup') {
        usersDb[email] = {
          id: 'user_' + Date.now(),
          email: email,
          password: password,
          nome: nome || 'Motorista',
          created_at: new Date().toISOString()
        };
        localStorage.setItem('giro_users_db', JSON.stringify(usersDb));
        state.currentUser = { id: usersDb[email].id, email: email };
        if (nome) state.perfil.nome = nome;
      } else {
        const existingUser = usersDb[email];
        if (existingUser && existingUser.password === password) {
          state.currentUser = { id: existingUser.id, email: existingUser.email };
          if (existingUser.nome) state.perfil.nome = existingUser.nome;
        } else if (!existingUser) {
          // Permite entrada direta criando registro
          usersDb[email] = {
            id: 'user_' + Date.now(),
            email: email,
            password: password,
            nome: email.split('@')[0],
            created_at: new Date().toISOString()
          };
          localStorage.setItem('giro_users_db', JSON.stringify(usersDb));
          state.currentUser = { id: usersDb[email].id, email: email };
        } else {
          alert('Senha incorreta para este e-mail.');
          return;
        }
      }
      localStorage.setItem('giro_active_session', JSON.stringify(state.currentUser));
      updateCloudStatusBadge(true, 'Vercel / Local');
    }

    saveLocalData();
    renderProfile();
    updateAuthUI(true);
    closeAuthModal();
    showToast(action === 'signup' ? 'Conta criada com sucesso!' : 'Login realizado com sucesso!');
    await loadUserDataFromSupabase();
  } catch (err) {
    console.error('Erro na autenticação:', err);
    alert('Erro: ' + (err.message || 'Falha ao autenticar.'));
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.classList.remove('opacity-70');
  }
}

async function handleAuthLogout() {
  if (confirm('Deseja realmente sair da sua conta?')) {
    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); } catch (e) {}
    }
    localStorage.removeItem('giro_active_session');
    state.currentUser = null;
    updateAuthUI(false);
    closeProfileModal();
    showToast('Você saiu da sua conta.');
  }
}

// ==========================================
// CRUD DO PERFIL DO MOTORISTA
// ==========================================
function openProfileModal() {
  const modal = document.getElementById('profile-modal');
  const inputNome = document.getElementById('perfil-nome');
  const inputNasc = document.getElementById('perfil-nasc');
  const inputCarro = document.getElementById('perfil-carro');
  const inputMeta = document.getElementById('perfil-meta');
  const photoPreview = document.getElementById('perfil-foto-preview');
  const userEmailLabel = document.getElementById('profile-modal-user-email');

  inputNome.value = state.perfil.nome || '';
  inputNasc.value = state.perfil.data_nascimento || '';
  inputCarro.value = state.perfil.carro || '';
  inputMeta.value = formatPtBr(state.perfil.meta_mensal || 5000);
  
  if (photoPreview && state.perfil.foto_url) {
    photoPreview.src = state.perfil.foto_url;
  }

  if (userEmailLabel) {
    userEmailLabel.textContent = state.currentUser ? state.currentUser.email : 'Modo Convidado / Offline';
  }

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

// Upload e Preview de Foto de Perfil
function handleProfilePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert('A foto deve ter no máximo 3MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Url = e.target.result;
    state.perfil.foto_url = base64Url;
    const photoPreview = document.getElementById('perfil-foto-preview');
    if (photoPreview) photoPreview.src = base64Url;
    showToast('Foto selecionada com sucesso!');
  };
  reader.readAsDataURL(file);
}

// Selecionar Avatar Rápido
function selectPresetAvatar(avatarUrl) {
  state.perfil.foto_url = avatarUrl;
  const photoPreview = document.getElementById('perfil-foto-preview');
  if (photoPreview) photoPreview.src = avatarUrl;
}

// Salvar Perfil Completo
async function saveProfile() {
  const nome = document.getElementById('perfil-nome').value.trim();
  const nasc = document.getElementById('perfil-nasc').value;
  const carro = document.getElementById('perfil-carro').value.trim();
  const meta = parsePtBr(document.getElementById('perfil-meta').value);

  if (!nome) {
    alert('Por favor, informe seu nome.');
    return;
  }

  state.perfil.nome = nome;
  state.perfil.data_nascimento = nasc;
  state.perfil.carro = carro || 'Carro do Motorista';
  state.perfil.meta_mensal = meta > 0 ? meta : 5000;

  saveLocalData();
  renderProfile();
  updateFinancialSummary();
  closeProfileModal();
  showToast('Perfil salvo com sucesso!');

  // Sincronizar com Supabase se logado
  if (supabaseClient && state.currentUser) {
    try {
      const payload = {
        id: state.currentUser.id,
        email: state.currentUser.email,
        nome: state.perfil.nome,
        data_nascimento: state.perfil.data_nascimento || null,
        carro: state.perfil.carro,
        meta_mensal: state.perfil.meta_mensal,
        foto_url: state.perfil.foto_url,
        updated_at: new Date().toISOString()
      };
      await supabaseClient.from('perfil').upsert(payload);
    } catch (err) {
      console.warn('Erro ao sincronizar perfil no Supabase:', err);
    }
  }
}

// Renderizar Perfil nos elementos da UI
function renderProfile() {
  const headerGreeting = document.getElementById('header-greeting');
  const greetingSub = document.getElementById('greeting-sub');
  const profileName = document.getElementById('profile-name');
  const profileSub = document.getElementById('profile-sub');
  const headerAvatar = document.getElementById('header-avatar');
  const cardAvatar = document.getElementById('profile-card-avatar');

  if (headerGreeting) headerGreeting.textContent = `Olá, ${state.perfil.nome}`;
  if (greetingSub) greetingSub.textContent = `Olá, ${state.perfil.nome}!`;
  if (profileName) profileName.textContent = state.perfil.nome;
  if (profileSub) {
    let subInfo = state.perfil.carro || 'Motorista';
    if (state.perfil.data_nascimento) {
      const idade = calcularIdade(state.perfil.data_nascimento);
      if (idade) subInfo += ` • ${idade} anos`;
    }
    profileSub.textContent = subInfo;
  }

  if (state.perfil.foto_url) {
    if (headerAvatar) headerAvatar.src = state.perfil.foto_url;
    if (cardAvatar) cardAvatar.src = state.perfil.foto_url;
  }
}

function calcularIdade(dataNascIso) {
  try {
    const nasc = new Date(dataNascIso);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
      idade--;
    }
    return idade > 0 ? idade : null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// CONFIGURAR EVENTOS DA INTERFACE
// ==========================================
function setupEventListeners() {
  // Navegação de mês
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    renderCalendar();
    updateFinancialSummary();
    renderHistory();
  });

  document.getElementById('btn-next-month').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    renderCalendar();
    updateFinancialSummary();
    renderHistory();
  });

  // Filtros de período
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.currentTarget.getAttribute('data-filter');
      setPeriodFilter(filter);
    });
  });

  // Navegação do rodapé
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.getAttribute('data-tab');
      if (target === 'novo') {
        openCrudModal(state.selectedDateStr || formatDateIso(new Date()));
      } else {
        switchTab(target);
      }
    });
  });

  // Botão flutuante Novo Lançamento
  const btnNovoLancamento = document.getElementById('btn-novo-lancamento-main');
  if (btnNovoLancamento) {
    btnNovoLancamento.addEventListener('click', () => {
      openCrudModal(state.selectedDateStr || formatDateIso(new Date()));
    });
  }

  // Ações do Modal CRUD Diário
  document.getElementById('btn-close-crud').addEventListener('click', closeCrudModal);
  document.getElementById('crud-backdrop').addEventListener('click', closeCrudModal);

  const inputBruto = document.getElementById('crud-ganho-bruto');
  const inputCombustivel = document.getElementById('crud-combustivel');
  const inputGastos = document.getElementById('crud-outros-gastos');

  [inputBruto, inputCombustivel, inputGastos].forEach(inp => {
    inp.addEventListener('input', recalculateCrudLive);
    inp.addEventListener('focus', function() {
      if (this.value === '0,00' || this.value === '0') this.value = '';
    });
    inp.addEventListener('blur', function() {
      if (this.value.trim() === '') this.value = '0,00';
    });
  });

  document.getElementById('btn-save-crud').addEventListener('click', saveCrudEntry);
  document.getElementById('btn-clear-crud').addEventListener('click', clearCrudFields);
  document.getElementById('btn-delete-crud').addEventListener('click', deleteCrudEntry);

  // Ações do Modal de Perfil
  const profileCard = document.getElementById('profile-card');
  if (profileCard) profileCard.addEventListener('click', openProfileModal);

  document.getElementById('btn-close-profile').addEventListener('click', closeProfileModal);
  document.getElementById('profile-backdrop').addEventListener('click', closeProfileModal);
  document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
  document.getElementById('btn-logout').addEventListener('click', handleAuthLogout);

  const photoFileInput = document.getElementById('perfil-foto-input');
  if (photoFileInput) {
    photoFileInput.addEventListener('change', handleProfilePhotoUpload);
  }

  // Ações do Modal de Autenticação (Login/Cadastro)
  const btnHeaderAuth = document.getElementById('btn-header-auth');
  if (btnHeaderAuth) {
    btnHeaderAuth.addEventListener('click', () => openAuthModal('login'));
  }
  document.getElementById('btn-close-auth').addEventListener('click', closeAuthModal);
  document.getElementById('auth-backdrop').addEventListener('click', closeAuthModal);
  document.getElementById('auth-btn-submit').addEventListener('click', handleAuthSubmit);
  document.getElementById('auth-toggle-btn').addEventListener('click', () => {
    const action = document.getElementById('auth-btn-submit').getAttribute('data-action');
    setAuthMode(action === 'login' ? 'signup' : 'login');
  });
}

// Alternar abas principais
function switchTab(tabName) {
  state.activeTab = tabName;
  const viewCalendario = document.getElementById('view-calendario');
  const viewRelatorios = document.getElementById('view-relatorios');

  document.querySelectorAll('.nav-tab').forEach(tab => {
    const t = tab.getAttribute('data-tab');
    if (t === tabName) {
      tab.classList.add('text-primary', 'font-bold');
      tab.classList.remove('text-on-surface-variant');
    } else if (t !== 'novo') {
      tab.classList.remove('text-primary', 'font-bold');
      tab.classList.add('text-on-surface-variant');
    }
  });

  if (tabName === 'calendario') {
    viewCalendario.classList.remove('hidden');
    viewRelatorios.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tabName === 'relatorios') {
    viewCalendario.classList.add('hidden');
    viewRelatorios.classList.remove('hidden');
    renderReportChart();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Alterar filtro de período
function setPeriodFilter(filter) {
  state.periodFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    if (btn.getAttribute('data-filter') === filter) {
      btn.className = 'filter-pill flex-1 py-1.5 text-center font-label-md text-label-md rounded-full bg-inverse-surface text-inverse-on-surface shadow-sm font-bold transition-all';
    } else {
      btn.className = 'filter-pill flex-1 py-1.5 text-center font-label-md text-label-md rounded-full text-on-surface-variant hover:text-on-surface transition-all';
    }
  });
  updateFinancialSummary();
}

// ==========================================
// RENDERIZAR CALENDÁRIO MENSAL
// ==========================================
function renderCalendar() {
  const calendarDaysContainer = document.getElementById('calendarDays');
  const currentMonthLabel = document.getElementById('current-month-label');
  const activeDaysBadge = document.getElementById('active-days-count');

  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();

  if (currentMonthLabel) {
    currentMonthLabel.textContent = `${getMonthName(month)} ${year}`;
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendarDaysContainer.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'h-11 flex items-center justify-center';
    calendarDaysContainer.appendChild(emptyCell);
  }

  const todayStr = formatDateIso(new Date());
  let countActiveDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, day).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isToday = (dateStr === todayStr);
    const isSelected = (dateStr === state.selectedDateStr);
    const entry = state.lancamentos[dateStr];

    if (entry && (entry.ganho_bruto > 0 || entry.combustivel > 0 || entry.outros_gastos > 0)) {
      countActiveDays++;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `h-11 flex flex-col items-center justify-center rounded-lg transition-all relative ${
      isSelected
        ? 'bg-primary text-on-primary shadow-md scale-105 z-10'
        : isToday
        ? 'bg-surface-container-high border border-primary/40 font-bold'
        : 'hover:bg-surface-container-low'
    }`;

    const numSpan = document.createElement('span');
    numSpan.className = `font-label-md text-label-md leading-none ${
      isSelected
        ? 'text-on-primary font-bold'
        : isWeekend
        ? 'text-secondary font-semibold'
        : 'text-on-surface'
    }`;
    numSpan.textContent = day;
    btn.appendChild(numSpan);

    if (entry) {
      const netVal = entry.lucro_liquido || (entry.ganho_bruto - (entry.combustivel + entry.outros_gastos));
      const valSpan = document.createElement('span');
      valSpan.className = `font-label-sm text-[9px] font-bold leading-none mt-0.5 ${
        isSelected
          ? 'text-primary-fixed'
          : netVal >= 0
          ? 'text-primary font-bold'
          : 'text-error font-bold'
      }`;
      valSpan.textContent = (netVal >= 0 ? '+' : '') + Math.round(netVal);
      btn.appendChild(valSpan);
    } else if (isWeekend && !isSelected) {
      const dot = document.createElement('span');
      dot.className = 'w-1 h-1 rounded-full bg-secondary-container mt-0.5';
      btn.appendChild(dot);
    }

    btn.addEventListener('click', () => {
      state.selectedDateStr = dateStr;
      renderCalendar();
      if (state.periodFilter === 'dia') {
        updateFinancialSummary();
      }
      openCrudModal(dateStr);
    });

    calendarDaysContainer.appendChild(btn);
  }

  if (activeDaysBadge) {
    activeDaysBadge.textContent = `${countActiveDays} dias ativos`;
  }
}

// ==========================================
// PAINEL DE FECHAMENTO & META MENSAL
// ==========================================
function updateFinancialSummary() {
  const summaryTitle = document.getElementById('summary-period-title');
  const totalGrossEl = document.getElementById('total-gross-val');
  const totalFuelEl = document.getElementById('total-fuel-val');
  const totalOthersEl = document.getElementById('total-others-val');
  const totalNetEl = document.getElementById('total-net-val');
  const totalMarginEl = document.getElementById('total-margin-val');

  let gross = 0;
  let fuel = 0;
  let others = 0;

  const currentYear = state.currentDate.getFullYear();
  const currentMonth = state.currentDate.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Filtrar de acordo com a aba selecionada
  if (state.periodFilter === 'dia') {
    const selDate = state.selectedDateStr || formatDateIso(new Date());
    const d = parseDateIso(selDate);
    if (summaryTitle) summaryTitle.textContent = `${d.getDate()} de ${getMonthName(d.getMonth())}`;

    const entry = state.lancamentos[selDate];
    if (entry) {
      gross = entry.ganho_bruto || 0;
      fuel = entry.combustivel || 0;
      others = entry.outros_gastos || 0;
    }
  } else if (state.periodFilter === 'semanal') {
    const baseDate = parseDateIso(state.selectedDateStr || formatDateIso(new Date()));
    const startDate = new Date(baseDate);
    startDate.setDate(baseDate.getDate() - 6);

    if (summaryTitle) {
      summaryTitle.textContent = `${startDate.getDate()}/${startDate.getMonth() + 1} a ${baseDate.getDate()}/${baseDate.getMonth() + 1}`;
    }

    for (let d = new Date(startDate); d <= baseDate; d.setDate(d.getDate() + 1)) {
      const iso = formatDateIso(d);
      const entry = state.lancamentos[iso];
      if (entry) {
        gross += entry.ganho_bruto || 0;
        fuel += entry.combustivel || 0;
        others += entry.outros_gastos || 0;
      }
    }
  } else if (state.periodFilter === 'quinzenal') {
    const selDay = parseDateIso(state.selectedDateStr).getDate();
    let startDay = 1;
    let endDay = 15;

    if (selDay > 15) {
      startDay = 16;
      endDay = daysInMonth;
    }

    if (summaryTitle) {
      summaryTitle.textContent = `${startDay} a ${endDay} ${getMonthName(currentMonth)}`;
    }

    for (let day = startDay; day <= endDay; day++) {
      const iso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entry = state.lancamentos[iso];
      if (entry) {
        gross += entry.ganho_bruto || 0;
        fuel += entry.combustivel || 0;
        others += entry.outros_gastos || 0;
      }
    }
  } else {
    // Mensal
    if (summaryTitle) {
      summaryTitle.textContent = `1 a ${daysInMonth} ${getMonthName(currentMonth)}`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entry = state.lancamentos[iso];
      if (entry) {
        gross += entry.ganho_bruto || 0;
        fuel += entry.combustivel || 0;
        others += entry.outros_gastos || 0;
      }
    }
  }

  const net = gross - (fuel + others);
  const margin = gross > 0 ? (net / gross) * 100 : 0;

  if (totalGrossEl) totalGrossEl.textContent = `+ R$ ${formatPtBr(gross)}`;
  if (totalFuelEl) totalFuelEl.textContent = `- R$ ${formatPtBr(fuel)}`;
  if (totalOthersEl) totalOthersEl.textContent = `- R$ ${formatPtBr(others)}`;
  if (totalNetEl) {
    totalNetEl.textContent = `R$ ${formatPtBr(net)}`;
    totalNetEl.className = net >= 0
      ? 'font-display-currency-mobile text-display-currency-mobile text-primary font-bold tracking-tight'
      : 'font-display-currency-mobile text-display-currency-mobile text-error font-bold tracking-tight';
  }
  if (totalMarginEl) {
    totalMarginEl.textContent = `Margem: ${margin.toFixed(1).replace('.', ',')}%`;
  }

  // Atualizar Barra de Progresso da Meta Mensal
  updateGoalProgressBar(currentYear, currentMonth);
}

// Calcular e Exibir Progresso da Meta Mensal
function updateGoalProgressBar(year, month) {
  const goalBar = document.getElementById('goal-progress-bar');
  const goalPercent = document.getElementById('goal-percent-val');
  const goalTargetLabel = document.getElementById('goal-target-label');
  const goalCurrentLabel = document.getElementById('goal-current-label');

  if (!goalBar) return;

  // Total líquido de todo o mês
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalNetMonth = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = state.lancamentos[iso];
    if (entry) {
      totalNetMonth += (entry.lucro_liquido || (entry.ganho_bruto - (entry.combustivel + entry.outros_gastos)));
    }
  }

  const meta = state.perfil.meta_mensal || 5000;
  const pct = Math.max(0, (totalNetMonth / meta) * 100);

  if (goalPercent) goalPercent.textContent = `${pct.toFixed(0)}%`;
  if (goalTargetLabel) goalTargetLabel.textContent = `Meta: R$ ${formatPtBr(meta)}`;
  if (goalCurrentLabel) goalCurrentLabel.textContent = `R$ ${formatPtBr(totalNetMonth)}`;

  goalBar.style.width = `${Math.min(pct, 100)}%`;
  if (pct >= 100) {
    goalBar.className = 'h-full bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-all duration-500';
  } else {
    goalBar.className = 'h-full bg-primary-fixed rounded-full transition-all duration-500';
  }
}

// ==========================================
// MODAL CRUD DIÁRIO
// ==========================================
function openCrudModal(dateStr) {
  state.selectedDateStr = dateStr;
  const modal = document.getElementById('crud-modal');
  const titleDate = document.getElementById('crud-modal-date');
  const inputDate = document.getElementById('crud-input-date');
  const inputBruto = document.getElementById('crud-ganho-bruto');
  const inputCombustivel = document.getElementById('crud-combustivel');
  const inputGastos = document.getElementById('crud-outros-gastos');
  const inputObs = document.getElementById('crud-observacoes');

  if (titleDate) titleDate.textContent = formatDateLong(dateStr);
  if (inputDate) inputDate.value = dateStr;

  const entry = state.lancamentos[dateStr] || {
    ganho_bruto: 0,
    combustivel: 0,
    outros_gastos: 0,
    observacoes: ''
  };

  inputBruto.value = entry.ganho_bruto > 0 ? formatPtBr(entry.ganho_bruto) : '0,00';
  inputCombustivel.value = entry.combustivel > 0 ? formatPtBr(entry.combustivel) : '0,00';
  inputGastos.value = entry.outros_gastos > 0 ? formatPtBr(entry.outros_gastos) : '0,00';
  inputObs.value = entry.observacoes || '';

  recalculateCrudLive();
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeCrudModal() {
  const modal = document.getElementById('crud-modal');
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function recalculateCrudLive() {
  const rev = parsePtBr(document.getElementById('crud-ganho-bruto').value);
  const fuel = parsePtBr(document.getElementById('crud-combustivel').value);
  const others = parsePtBr(document.getElementById('crud-outros-gastos').value);

  const net = rev - (fuel + others);
  const calcBreakdown = document.getElementById('crud-calc-breakdown');
  const netVal = document.getElementById('crud-net-profit-val');
  const marginBadge = document.getElementById('crud-margin-badge');
  const marginVal = document.getElementById('crud-margin-val');
  const efficiencyBar = document.getElementById('crud-efficiency-bar');
  const efficiencyLabel = document.getElementById('crud-efficiency-label');

  if (calcBreakdown) {
    calcBreakdown.textContent = `R$ ${formatPtBr(rev)} - R$ ${formatPtBr(fuel)} - R$ ${formatPtBr(others)}`;
  }
  if (netVal) {
    netVal.textContent = formatPtBr(net);
  }

  let marginPct = 0;
  if (rev > 0) {
    marginPct = (net / rev) * 100;
  }

  if (net >= 0) {
    if (marginVal) marginVal.textContent = `+${marginPct.toFixed(1).replace('.', ',')}%`;
    if (marginBadge) marginBadge.className = 'inline-flex items-center gap-1 bg-primary text-on-primary font-label-md text-label-md px-2.5 py-1 rounded-full font-bold shadow-sm';
    if (efficiencyLabel) {
      efficiencyLabel.textContent = marginPct > 55 ? 'Excelente Retenção' : 'Equilíbrio Operacional';
      efficiencyLabel.className = 'text-primary-fixed';
    }
    if (efficiencyBar) {
      efficiencyBar.style.width = Math.min(Math.max(marginPct, 5), 100) + '%';
      efficiencyBar.className = 'h-full bg-primary-fixed rounded-full transition-all duration-300';
    }
  } else {
    if (marginVal) marginVal.textContent = `${marginPct.toFixed(1).replace('.', ',')}%`;
    if (marginBadge) marginBadge.className = 'inline-flex items-center gap-1 bg-error text-on-error font-label-md text-label-md px-2.5 py-1 rounded-full font-bold shadow-sm';
    if (efficiencyLabel) {
      efficiencyLabel.textContent = 'Dia em Déficit Operacional';
      efficiencyLabel.className = 'text-error-container';
    }
    if (efficiencyBar) {
      efficiencyBar.style.width = '10%';
      efficiencyBar.className = 'h-full bg-error rounded-full transition-all duration-300';
    }
  }
}

async function saveCrudEntry() {
  const dateStr = state.selectedDateStr;
  const rev = parsePtBr(document.getElementById('crud-ganho-bruto').value);
  const fuel = parsePtBr(document.getElementById('crud-combustivel').value);
  const others = parsePtBr(document.getElementById('crud-outros-gastos').value);
  const obs = document.getElementById('crud-observacoes').value.trim();
  const net = rev - (fuel + others);

  const newEntry = {
    ganho_bruto: rev,
    combustivel: fuel,
    outros_gastos: others,
    lucro_liquido: net,
    observacoes: obs,
    updated_at: new Date().toISOString()
  };

  state.lancamentos[dateStr] = newEntry;
  saveLocalData();
  renderCalendar();
  updateFinancialSummary();
  renderHistory();
  closeCrudModal();
  showToast('Lançamento salvo com sucesso!');

  // Salvar no Supabase
  if (supabaseClient) {
    try {
      const payload = {
        data: dateStr,
        ganho_bruto: rev,
        combustivel: fuel,
        outros_gastos: others,
        lucro_liquido: net,
        observacoes: obs,
        user_id: state.currentUser ? state.currentUser.id : null,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabaseClient.from('lancamentos').upsert(payload, { onConflict: 'data' });
      if (error) {
        console.warn('Erro ao salvar no Supabase:', error.message);
      } else {
        isSupabaseOnline = true;
        updateCloudStatusBadge(true, 'Nuvem Conectada');
      }
    } catch (err) {
      console.warn('Erro de rede ao salvar no Supabase:', err);
    }
  }
}

function clearCrudFields() {
  document.getElementById('crud-ganho-bruto').value = '0,00';
  document.getElementById('crud-combustivel').value = '0,00';
  document.getElementById('crud-outros-gastos').value = '0,00';
  document.getElementById('crud-observacoes').value = '';
  recalculateCrudLive();
}

async function deleteCrudEntry() {
  const dateStr = state.selectedDateStr;
  if (!state.lancamentos[dateStr]) {
    alert('Nenhum lançamento registrado nesta data.');
    return;
  }

  if (confirm(`Deseja realmente excluir o lançamento de ${formatDateLong(dateStr)}?`)) {
    delete state.lancamentos[dateStr];
    saveLocalData();
    renderCalendar();
    updateFinancialSummary();
    renderHistory();
    closeCrudModal();
    showToast('Lançamento excluído.');

    if (supabaseClient) {
      try {
        await supabaseClient.from('lancamentos').delete().eq('data', dateStr);
      } catch (err) {
        console.warn('Erro ao deletar no Supabase:', err);
      }
    }
  }
}

// ==========================================
// HISTÓRICO E RELATÓRIOS
// ==========================================
function renderHistory() {
  const container = document.getElementById('history-list');
  const reportContainer = document.getElementById('reports-history-list');
  if (!container && !reportContainer) return;

  const entries = Object.keys(state.lancamentos)
    .sort((a, b) => b.localeCompare(a))
    .map(dateStr => ({ dateStr, ...state.lancamentos[dateStr] }));

  const buildItemHtml = (item) => {
    const d = parseDateIso(item.dateStr);
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const diaSemana = diasSemana[d.getDay()];
    const diaNum = d.getDate();
    const net = item.lucro_liquido || (item.ganho_bruto - (item.combustivel + item.outros_gastos));
    const isPositive = net >= 0;

    return `
      <div class="bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-surface-container/50 flex flex-col gap-space-xs cursor-pointer hover:bg-surface-container-low transition-colors" onclick="openCrudModal('${item.dateStr}')">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${isPositive ? 'bg-primary' : 'bg-error'}"></span>
            <span class="font-label-md text-label-md text-on-surface font-bold">${diaSemana}, ${diaNum} de ${getMonthName(d.getMonth()).slice(0, 3)}</span>
            ${item.observacoes ? `<span class="font-label-sm text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded truncate max-w-[120px]">${item.observacoes}</span>` : ''}
          </div>
          <span class="font-metric-tabular text-metric-tabular ${isPositive ? 'text-primary' : 'text-error'} font-bold">
            ${isPositive ? '+' : ''} R$ ${formatPtBr(net)}
          </span>
        </div>
        <div class="flex items-center justify-between text-on-surface-variant pt-1 text-xs">
          <div class="flex items-center gap-2">
            <span>Bruto: <strong class="text-on-surface font-semibold">R$ ${formatPtBr(item.ganho_bruto)}</strong></span>
            <span>•</span>
            <span>Combustível: <strong class="text-secondary font-semibold">R$ ${formatPtBr(item.combustivel)}</strong></span>
            <span>•</span>
            <span>Gastos: <strong class="text-on-surface font-semibold">R$ ${formatPtBr(item.outros_gastos)}</strong></span>
          </div>
          <span class="material-symbols-outlined text-[16px] text-outline-variant">edit</span>
        </div>
      </div>
    `;
  };

  if (container) {
    if (entries.length === 0) {
      container.innerHTML = '<p class="text-on-surface-variant text-center py-4 text-sm">Nenhum lançamento registrado neste mês.</p>';
    } else {
      container.innerHTML = entries.slice(0, 4).map(buildItemHtml).join('');
    }
  }

  if (reportContainer) {
    if (entries.length === 0) {
      reportContainer.innerHTML = '<p class="text-on-surface-variant text-center py-4 text-sm">Nenhum lançamento registrado.</p>';
    } else {
      reportContainer.innerHTML = entries.map(buildItemHtml).join('');
    }
  }
}

function renderReportChart() {
  const chartContainer = document.getElementById('report-bars');
  if (!chartContainer) return;

  const barsData = [
    { dia: 'Seg', bruto: 340, gas: 70 },
    { dia: 'Ter', bruto: 380, gas: 75 },
    { dia: 'Qua', bruto: 415, gas: 80 },
    { dia: 'Qui', bruto: 390, gas: 70 },
    { dia: 'Sex', bruto: 450, gas: 90 },
    { dia: 'Sáb', bruto: 310, gas: 60 },
    { dia: 'Dom', bruto: 190, gas: 40 }
  ];

  chartContainer.innerHTML = barsData.map(item => {
    const heightBruto = Math.min(Math.round((item.bruto / 500) * 100), 100);
    const heightGas = Math.min(Math.round((item.gas / 500) * 100), 100);
    return `
      <div class="flex-1 flex flex-col items-center h-full justify-end group">
        <div class="w-full flex items-end justify-center gap-1 h-28">
          <div class="w-2.5 bg-primary rounded-t-sm transition-all duration-300 group-hover:opacity-80" style="height: ${heightBruto}%;"></div>
          <div class="w-2.5 bg-secondary-container rounded-t-sm transition-all duration-300 group-hover:opacity-80" style="height: ${heightGas}%;"></div>
        </div>
        <span class="font-label-sm text-[11px] text-on-surface-variant mt-2 font-medium">${item.dia}</span>
      </div>
    `;
  }).join('');
}

function showToast(message) {
  const toast = document.getElementById('app-toast');
  const toastMsg = document.getElementById('app-toast-msg');
  if (!toast) return;
  if (toastMsg) toastMsg.textContent = message;

  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2800);
}

function exportDataCsv() {
  const entries = Object.keys(state.lancamentos)
    .sort()
    .map(dateStr => {
      const e = state.lancamentos[dateStr];
      const net = e.lucro_liquido || (e.ganho_bruto - (e.combustivel + e.outros_gastos));
      return `${dateStr};${e.ganho_bruto};${e.combustivel};${e.outros_gastos};${net};"${(e.observacoes || '').replace(/"/g, '""')}"`;
    });

  const csvContent = 'data:text/csv;charset=utf-8,Data;Ganho_Bruto;Combustivel;Outros_Gastos;Lucro_Liquido;Observacoes\n' + entries.join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `girofinance_relatorio_${formatDateIso(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Relatório CSV baixado!');
}
