/**
 * GiroFinance - Calendário & Painel Financeiro Mobile
 * Gerenciamento de Estado, Autenticação Supabase Auth, Auto-Login por E-mail,
 * CRUD de Perfil e Lançamentos em Tempo Real.
 */

// Configuração do Supabase
const SUPABASE_URL = 'https://tqlyltckhlrjogvxqsbt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8San8xCyPGxEpk9ZcvX3aA_srBiHDqS';

let supabaseClient = null;
let isSupabaseOnline = false;

// Avatar padrão SVG limpo em Data URI
const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23006948'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

// Estado Global da Aplicação (TOTALMENTE LIMPO, SEM DADOS FAKE)
const state = {
  currentUser: null, // Usuário autenticado
  currentDate: new Date(), // Mês/ano exibido no calendário
  selectedDateStr: formatDateIso(new Date()), // YYYY-MM-DD
  activeTab: 'calendario', // 'calendario' | 'relatorios'
  periodFilter: 'mensal', // 'dia' | 'semanal' | 'quinzenal' | 'mensal'
  lancamentos: {}, // Inicia VAZIO: dados serão gerados conforme o usuário adicionar
  perfil: {
    nome: '',
    data_nascimento: '',
    carro: '',
    meta_mensal: 0,
    foto_url: ''
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

// Tradutor de mensagens de erro do Supabase para português amigável
function translateAuthError(message) {
  if (!message) return 'Ocorreu um erro ao processar sua solicitação. Tente novamente.';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos. Por favor, confira seus dados e tente novamente.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Enviamos um link de confirmação para sua caixa de entrada.';
  }
  if (lower.includes('user already registered') || lower.includes('already registered')) {
    return 'Este e-mail já possui cadastro. Por favor, clique em "Fazer Login" para acessar sua conta.';
  }
  if (lower.includes('password should be at least')) {
    return 'Sua senha deve ter no mínimo 6 caracteres para garantir a segurança da sua conta.';
  }
  if (lower.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Por favor, aguarde alguns instantes.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Sem conexão com o servidor. Seus dados continuam salvos com segurança no seu aparelho.';
  }
  return message;
}

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  cleanLegacyMockData(); // Remove resquícios de dados falsos de versões anteriores
  initSupabase();
  loadLocalData();
  setupEventListeners();
  renderProfile();
  renderCalendar();
  updateFinancialSummary();
  renderHistory();
  await checkSessionAndSync();
});

// Limpeza de dados fake antigos
function cleanLegacyMockData() {
  try {
    const isCleaned = localStorage.getItem('giro_clean_v2');
    if (!isCleaned) {
      const savedPerfil = localStorage.getItem('giro_perfil');
      if (savedPerfil && savedPerfil.includes('Carlos Eduardo')) {
        localStorage.removeItem('giro_perfil');
      }
      const savedLanc = localStorage.getItem('giro_lancamentos');
      if (savedLanc && (savedLanc.includes('Corridas aeroporto') || savedLanc.includes('Sexta pico'))) {
        localStorage.removeItem('giro_lancamentos');
      }
      localStorage.setItem('giro_clean_v2', 'true');
    }
  } catch (e) {
    console.warn('Erro ao limpar dados legado:', e);
  }
}

// Inicializar cliente Supabase com suporte a Auto-Login por link de e-mail
function initSupabase() {
  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true // Captura automaticamente tokens de confirmação de e-mail da URL
        }
      });
      console.log('Cliente Supabase inicializado com sucesso.');

      // Ouvir mudanças de autenticação (Confirmação de e-mail, Login, Logout)
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Evento de Autenticação Supabase:', event, session?.user?.email);

        if (session && session.user) {
          state.currentUser = session.user;
          localStorage.setItem('giro_active_session', JSON.stringify({ id: session.user.id, email: session.user.email }));
          updateAuthUI(true);
          updateCloudStatusBadge(true, 'Nuvem Conectada');

          // Limpa tokens da barra de endereço caso tenha vindo do link do e-mail
          if (window.location.hash || window.location.search.includes('code=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            showToast('🎉 E-mail confirmado com sucesso! Bem-vindo(a) ao GiroFinance!');
          }

          // Fecha eventuais modais de autenticação que estejam abertos
          closeAuthModal();
          closeEmailConfirmModal();

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

// Verificar sessão atual (Supabase + Local)
async function checkSessionAndSync() {
  // 1. Tentar recuperar sessão local ativa
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
      updateCloudStatusBadge(true, 'Nuvem Conectada');
      await loadUserDataFromSupabase();
    } else if (!state.currentUser) {
      updateAuthUI(false);
    }
  } catch (err) {
    console.warn('Erro ao checar sessão Supabase:', err);
    if (!state.currentUser) updateCloudStatusBadge(false, 'Modo Local');
  }
}

// Carregar dados locais (estritamente dados salvos pelo usuário, SEM mocks)
function loadLocalData() {
  try {
    const savedLancamentos = localStorage.getItem('giro_lancamentos');
    if (savedLancamentos) {
      state.lancamentos = JSON.parse(savedLancamentos);
    } else {
      state.lancamentos = {}; // Vazio se nunca adicionou nada
    }

    const savedPerfil = localStorage.getItem('giro_perfil');
    if (savedPerfil) {
      state.perfil = { ...state.perfil, ...JSON.parse(savedPerfil) };
    }
  } catch (e) {
    console.error('Erro ao ler localStorage:', e);
  }
}

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

    // 1. Carregar perfil do usuário logado
    const { data: perfilData, error: perfilError } = await supabaseClient
      .from('perfil')
      .select('*')
      .eq('id', state.currentUser.id)
      .maybeSingle();

    if (!perfilError && perfilData) {
      if (perfilData.nome) state.perfil.nome = perfilData.nome;
      if (perfilData.data_nascimento) state.perfil.data_nascimento = perfilData.data_nascimento;
      if (perfilData.carro) state.perfil.carro = perfilData.carro;
      if (perfilData.meta_mensal !== undefined && perfilData.meta_mensal !== null) {
        state.perfil.meta_mensal = Number(perfilData.meta_mensal);
      }
      if (perfilData.foto_url) state.perfil.foto_url = perfilData.foto_url;
      saveLocalData();
      renderProfile();
    }

    // 2. Carregar lançamentos do usuário logado
    const { data: lancamentosData, error: lancError } = await supabaseClient
      .from('lancamentos')
      .select('*')
      .eq('user_id', state.currentUser.id);

    if (!lancError && lancamentosData && Array.isArray(lancamentosData)) {
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
    console.warn('Erro ao carregar dados no Supabase:', err);
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
    badge.title = 'Salvo no seu dispositivo com segurança.';
  }
}

// ==========================================
// AUTENTICAÇÃO (LOGIN, CADASTRO E AUTO-LOGIN)
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
    if (userAvatar) userAvatar.classList.remove('hidden');
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

function openEmailConfirmModal(email) {
  const modal = document.getElementById('email-confirm-modal');
  const emailVal = document.getElementById('confirm-modal-email-val');
  if (emailVal) emailVal.textContent = email;
  if (modal) modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeEmailConfirmModal() {
  const modal = document.getElementById('email-confirm-modal');
  if (modal) modal.classList.add('hidden');
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
    subtitle.textContent = 'Informe seu e-mail e crie uma senha segura';
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
    alert('A senha deve ter no mínimo 6 caracteres.');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.classList.add('opacity-70');

  try {
    let success = false;

    // 1. Tentar autenticação via Supabase se o cliente estiver disponível
    if (supabaseClient) {
      if (action === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { nome: nome || 'Motorista' },
            emailRedirectTo: window.location.origin + window.location.pathname // Garante retorno direto para auto-login
          }
        });

        if (error) {
          throw error;
        }

        // Se o Supabase exigir confirmação por e-mail (comportamento padrão seguro)
        if (data?.user && !data?.session) {
          closeAuthModal();
          openEmailConfirmModal(email);
          return;
        }

        // Se já retornou com sessão imediata
        if (data?.session) {
          state.currentUser = data.user;
          if (nome) state.perfil.nome = nome;
          success = true;
        }
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
        if (data?.user) {
          state.currentUser = data.user;
          success = true;
        }
      }
    }

    // 2. Fallback local inteligente caso o Supabase não esteja ativo
    if (!success && !supabaseClient) {
      let usersDb = {};
      try {
        usersDb = JSON.parse(localStorage.getItem('giro_users_db') || '{}');
      } catch (e) { usersDb = {}; }

      if (action === 'signup') {
        usersDb[email] = {
          id: 'user_' + Date.now(),
          email: email,
          password: password,
          nome: nome || email.split('@')[0],
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
          alert('E-mail ou senha incorretos.');
          return;
        }
      }
    }

    if (state.currentUser) {
      localStorage.setItem('giro_active_session', JSON.stringify({ id: state.currentUser.id, email: state.currentUser.email }));
      saveLocalData();
      renderProfile();
      updateAuthUI(true);
      closeAuthModal();
      showToast(action === 'signup' ? '🎉 Conta criada com sucesso!' : '👋 Bem-vindo(a) de volta!');
      await loadUserDataFromSupabase();
    }
  } catch (err) {
    console.error('Erro na autenticação:', err);
    alert(translateAuthError(err.message));
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
  inputMeta.value = state.perfil.meta_mensal > 0 ? formatPtBr(state.perfil.meta_mensal) : '';
  
  if (photoPreview) {
    photoPreview.src = state.perfil.foto_url || DEFAULT_AVATAR_SVG;
  }

  if (userEmailLabel) {
    userEmailLabel.textContent = state.currentUser ? state.currentUser.email : 'Modo Convidado / Não Conectado';
  }

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

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

function selectPresetAvatar(avatarUrl) {
  state.perfil.foto_url = avatarUrl;
  const photoPreview = document.getElementById('perfil-foto-preview');
  if (photoPreview) photoPreview.src = avatarUrl;
}

async function saveProfile() {
  const nome = document.getElementById('perfil-nome').value.trim();
  const nasc = document.getElementById('perfil-nasc').value;
  const carro = document.getElementById('perfil-carro').value.trim();
  const meta = parsePtBr(document.getElementById('perfil-meta').value);

  state.perfil.nome = nome;
  state.perfil.data_nascimento = nasc;
  state.perfil.carro = carro;
  state.perfil.meta_mensal = meta >= 0 ? meta : 0;

  saveLocalData();
  renderProfile();
  updateFinancialSummary();
  closeProfileModal();
  showToast('Perfil salvo com sucesso!');

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

// Renderizar Perfil nos elementos visuais da UI
function renderProfile() {
  const headerGreeting = document.getElementById('header-greeting');
  const greetingSub = document.getElementById('greeting-sub');
  const profileName = document.getElementById('profile-name');
  const profileSub = document.getElementById('profile-sub');
  const headerAvatar = document.getElementById('header-avatar');
  const cardAvatar = document.getElementById('profile-card-avatar');

  const temNome = Boolean(state.perfil.nome && state.perfil.nome.trim() !== '');

  if (headerGreeting) {
    headerGreeting.textContent = temNome ? `Olá, ${state.perfil.nome}` : 'Meu Painel';
  }
  if (greetingSub) {
    greetingSub.textContent = temNome ? `Olá, ${state.perfil.nome}!` : 'Olá! Bem-vindo';
  }
  if (profileName) {
    profileName.textContent = temNome ? state.perfil.nome : 'Configurar Meu Perfil';
  }
  if (profileSub) {
    let subInfo = state.perfil.carro || 'Toque para adicionar seu carro';
    if (state.perfil.data_nascimento) {
      const idade = calcularIdade(state.perfil.data_nascimento);
      if (idade) subInfo += ` • ${idade} anos`;
    }
    profileSub.textContent = subInfo;
  }

  const avatarSrc = state.perfil.foto_url || DEFAULT_AVATAR_SVG;
  if (headerAvatar) headerAvatar.src = avatarSrc;
  if (cardAvatar) cardAvatar.src = avatarSrc;
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

  // Ações do Modal de Autenticação
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

  // Ação de fechar modal de confirmação de e-mail
  const btnCloseEmailConfirm = document.getElementById('btn-close-email-confirm');
  if (btnCloseEmailConfirm) {
    btnCloseEmailConfirm.addEventListener('click', closeEmailConfirmModal);
  }
  const emailConfirmBackdrop = document.getElementById('email-confirm-backdrop');
  if (emailConfirmBackdrop) {
    emailConfirmBackdrop.addEventListener('click', closeEmailConfirmModal);
  }
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

    if (entry && (entry.ganho_bruto > 0 || entry.combustivel > 0 || entry.outros_gastos > 0)) {
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
    activeDaysBadge.textContent = `${countActiveDays} ${countActiveDays === 1 ? 'dia ativo' : 'dias ativos'}`;
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

  updateGoalProgressBar(currentYear, currentMonth);
}

function updateGoalProgressBar(year, month) {
  const goalBar = document.getElementById('goal-progress-bar');
  const goalPercent = document.getElementById('goal-percent-val');
  const goalTargetLabel = document.getElementById('goal-target-label');
  const goalCurrentLabel = document.getElementById('goal-current-label');

  if (!goalBar) return;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalNetMonth = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = state.lancamentos[iso];
    if (entry) {
      totalNetMonth += (entry.lucro_liquido || (entry.ganho_bruto - (entry.combustivel + entry.outros_gastos)));
    }
  }

  const meta = state.perfil.meta_mensal || 0;

  if (meta > 0) {
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
  } else {
    if (goalPercent) goalPercent.textContent = 'Não definida';
    if (goalTargetLabel) goalTargetLabel.textContent = 'Meta Mensal';
    if (goalCurrentLabel) goalCurrentLabel.textContent = `R$ ${formatPtBr(totalNetMonth)}`;
    goalBar.style.width = '0%';
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
      await supabaseClient.from('lancamentos').upsert(payload, { onConflict: 'data' });
      isSupabaseOnline = true;
      updateCloudStatusBadge(true, 'Nuvem Conectada');
    } catch (err) {
      console.warn('Erro ao salvar no Supabase:', err);
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
// HISTÓRICO E RELATÓRIOS (COM DADOS REAIS)
// ==========================================
function renderHistory() {
  const container = document.getElementById('history-list');
  const reportContainer = document.getElementById('reports-history-list');
  if (!container && !reportContainer) return;

  const entries = Object.keys(state.lancamentos)
    .filter(dateStr => {
      const e = state.lancamentos[dateStr];
      return e && (e.ganho_bruto > 0 || e.combustivel > 0 || e.outros_gastos > 0);
    })
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

  const emptyStateHtml = `
    <div class="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container/50 text-center flex flex-col items-center justify-center py-6 space-y-2">
      <div class="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center">
        <span class="material-symbols-outlined text-[24px]">calendar_add_on</span>
      </div>
      <p class="text-xs font-semibold text-on-surface">Nenhuma jornada registrada neste mês</p>
      <p class="text-[11px] text-on-surface-variant max-w-[240px]">Toque em um dia no calendário acima para fazer o seu primeiro lançamento!</p>
    </div>
  `;

  if (container) {
    if (entries.length === 0) {
      container.innerHTML = emptyStateHtml;
    } else {
      container.innerHTML = entries.slice(0, 4).map(buildItemHtml).join('');
    }
  }

  if (reportContainer) {
    if (entries.length === 0) {
      reportContainer.innerHTML = emptyStateHtml;
    } else {
      reportContainer.innerHTML = entries.map(buildItemHtml).join('');
    }
  }
}

// Renderizar gráfico da semana estritamente com base nos dados REAIS
function renderReportChart() {
  const chartContainer = document.getElementById('report-bars');
  if (!chartContainer) return;

  const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hoje = new Date();
  const ultimosDias = [];

  // Obter os últimos 7 dias a partir de hoje
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const iso = formatDateIso(d);
    const entry = state.lancamentos[iso] || { ganho_bruto: 0, combustivel: 0 };
    ultimosDias.push({
      dia: diasSemanaNomes[d.getDay()],
      bruto: entry.ganho_bruto || 0,
      gas: entry.combustivel || 0
    });
  }

  // Encontrar o maior valor bruto para normalização da altura das barras
  const maxBruto = Math.max(...ultimosDias.map(d => d.bruto), 100);

  chartContainer.innerHTML = ultimosDias.map(item => {
    const heightBruto = item.bruto > 0 ? Math.min(Math.round((item.bruto / maxBruto) * 100), 100) : 4;
    const heightGas = item.gas > 0 ? Math.min(Math.round((item.gas / maxBruto) * 100), 100) : 4;

    return `
      <div class="flex-1 flex flex-col items-center h-full justify-end group">
        <div class="w-full flex items-end justify-center gap-1 h-28">
          <div class="w-2.5 bg-primary rounded-t-sm transition-all duration-300 group-hover:opacity-80" style="height: ${heightBruto}%;" title="Bruto: R$ ${formatPtBr(item.bruto)}"></div>
          <div class="w-2.5 bg-secondary-container rounded-t-sm transition-all duration-300 group-hover:opacity-80" style="height: ${heightGas}%;" title="Gas: R$ ${formatPtBr(item.gas)}"></div>
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
  }, 3200);
}

function exportDataCsv() {
  const entries = Object.keys(state.lancamentos)
    .filter(dateStr => {
      const e = state.lancamentos[dateStr];
      return e && (e.ganho_bruto > 0 || e.combustivel > 0 || e.outros_gastos > 0);
    })
    .sort()
    .map(dateStr => {
      const e = state.lancamentos[dateStr];
      const net = e.lucro_liquido || (e.ganho_bruto - (e.combustivel + e.outros_gastos));
      return `${dateStr};${e.ganho_bruto};${e.combustivel};${e.outros_gastos};${net};"${(e.observacoes || '').replace(/"/g, '""')}"`;
    });

  if (entries.length === 0) {
    alert('Nenhum dado registrado para exportar.');
    return;
  }

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
