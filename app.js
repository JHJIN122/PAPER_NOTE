import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PURPOSE_OPTIONS = ['인용용', '영어표현'];

const COLUMN_DEFS = [
  { key: 'quote_text', label: '인용문', default: true },
  { key: 'title', label: '논문 제목', default: true },
  { key: 'authors', label: '저자', default: true },
  { key: 'year', label: '발행연도', default: true },
  { key: 'project', label: '프로젝트명', default: true },
  { key: 'purpose', label: '목적', default: true },
  { key: 'tags', label: '태그', default: false },
  { key: 'memo', label: '메모', default: false },
  { key: 'created_at', label: '추가한 날짜', default: true },
];
const SORTABLE_KEYS = new Set(['created_at', 'year', 'title', 'project']);

const state = {
  session: null,
  allQuotes: [],
  papers: [],
  loaded: false,
  filters: { author: null, project: null, tag: null, purpose: null },
  search: { category: 'title', term: '' },
  sort: { key: 'created_at', dir: 'desc' },
  columns: loadColumns(),
  authError: '',
};

function loadColumns() {
  try {
    const raw = localStorage.getItem('paperNotes.columns');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore malformed local storage */ }
  const cols = {};
  COLUMN_DEFS.forEach(c => { cols[c.key] = c.default; });
  return cols;
}
function saveColumns() {
  localStorage.setItem('paperNotes.columns', JSON.stringify(state.columns));
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function parseCommaList(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const root = document.getElementById('app');

// ---------- Data ----------
async function reloadQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, papers(*)')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); state.allQuotes = []; return; }
  state.allQuotes = data || [];
}

async function reloadPapers() {
  const { data, error } = await supabase.from('papers').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); state.papers = []; return; }
  state.papers = data || [];
}

function computeVisibleQuotes() {
  let rows = state.allQuotes;
  const f = state.filters;
  if (f.author) rows = rows.filter(q => (q.papers?.authors || []).includes(f.author));
  if (f.project) rows = rows.filter(q => (q.papers?.project || '') === f.project);
  if (f.tag) rows = rows.filter(q => (q.tags || []).includes(f.tag));
  if (f.purpose) rows = rows.filter(q => (q.purpose || []).includes(f.purpose));

  const term = (state.search.term || '').trim().toLowerCase();
  if (term) {
    rows = rows.filter(q => {
      switch (state.search.category) {
        case 'title': return (q.papers?.title || '').toLowerCase().includes(term);
        case 'authors': return (q.papers?.authors || []).some(a => a.toLowerCase().includes(term));
        case 'quote': return (q.quote_text || '').toLowerCase().includes(term);
        case 'memo': return (q.memo || '').toLowerCase().includes(term);
        case 'tag': return (q.tags || []).some(t => t.toLowerCase().includes(term));
        case 'project': return (q.papers?.project || '').toLowerCase().includes(term);
        case 'purpose': return (q.purpose || []).some(p => p.toLowerCase().includes(term));
        default: return true;
      }
    });
  }

  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    let av, bv;
    if (key === 'created_at') { av = a.created_at; bv = b.created_at; }
    else if (key === 'year') { av = a.papers?.year ?? -Infinity; bv = b.papers?.year ?? -Infinity; }
    else if (key === 'title') { av = (a.papers?.title || '').toLowerCase(); bv = (b.papers?.title || '').toLowerCase(); }
    else if (key === 'project') { av = (a.papers?.project || '').toLowerCase(); bv = (b.papers?.project || '').toLowerCase(); }
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
  return rows;
}

// ---------- Router ----------
async function route() {
  if (!state.session) { renderLogin(); return; }
  if (!state.loaded) {
    root.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    await Promise.all([reloadQuotes(), reloadPapers()]);
    state.loaded = true;
  }
  closeModal();
  const hash = location.hash || '#/';
  const editMatch = hash.match(/^#\/papers\/([^/]+)\/edit$/);
  const detailMatch = hash.match(/^#\/papers\/([^/]+)$/);
  if (hash === '#/papers' || hash === '#/papers/') renderPapersList();
  else if (hash === '#/papers/new') renderPaperForm(null);
  else if (editMatch) renderPaperForm(editMatch[1]);
  else if (detailMatch) renderPaperDetail(detailMatch[1]);
  else renderQuoteList();
}

// ---------- Shared UI ----------
function headerHtml() {
  return `
    <div class="topbar">
      <div class="brand"><a href="#/">Paper Notes</a></div>
      <div class="topbar-actions">
        <a href="#/papers" class="btn">논문 목록</a>
        <a href="#/papers/new" class="btn">+ 논문 추가</a>
        <button id="logout-btn" class="btn">로그아웃</button>
      </div>
    </div>
  `;
}
function bindHeader() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => { await supabase.auth.signOut(); });
}

function showModal(innerHtml) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal"><button class="close-btn" id="modal-close-btn" type="button">×</button>${innerHtml}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
}
function closeModal() {
  document.getElementById('modal-backdrop')?.remove();
}

// ---------- Auth views ----------
function renderLogin() {
  root.innerHTML = `
    <div class="login-wrap">
      <h1>Paper Notes</h1>
      <div class="panel">
        <form id="login-form">
          <div class="field"><label>이메일</label><input type="email" id="login-email" required></div>
          <div class="field"><label>비밀번호</label><input type="password" id="login-password" required></div>
          <button type="submit" class="btn-primary" style="width:100%">로그인</button>
          ${state.authError ? `<div class="error-msg">${esc(state.authError)}</div>` : ''}
        </form>
        <div class="login-toggle"><a href="#" id="show-signup">계정이 없으신가요? 회원가입</a></div>
      </div>
    </div>
  `;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    state.authError = error ? error.message : '';
    if (error) renderLogin();
  });
  document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); state.authError = ''; renderSignup(); });
}

function renderSignup() {
  root.innerHTML = `
    <div class="login-wrap">
      <h1>Paper Notes</h1>
      <div class="panel">
        <p class="hint">최초 1회 계정 생성용입니다. 생성 후 Supabase 대시보드에서 신규 가입을 막아주세요.</p>
        <form id="signup-form">
          <div class="field"><label>이메일</label><input type="email" id="signup-email" required></div>
          <div class="field"><label>비밀번호 (6자 이상)</label><input type="password" id="signup-password" required minlength="6"></div>
          <button type="submit" class="btn-primary" style="width:100%">회원가입</button>
          ${state.authError ? `<div class="error-msg">${esc(state.authError)}</div>` : ''}
        </form>
        <div class="login-toggle"><a href="#" id="show-login">이미 계정이 있으신가요? 로그인</a></div>
      </div>
    </div>
  `;
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { state.authError = error.message; renderSignup(); return; }
    state.authError = '';
    alert('가입 완료. 이메일 인증이 필요할 수 있습니다. 로그인해주세요.');
    renderLogin();
  });
  document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); state.authError = ''; renderLogin(); });
}

// ---------- Quote list ----------
function searchCategoryOptions() {
  const cats = [
    ['title', '제목'], ['authors', '저자'], ['quote', '인용문'], ['memo', '메모'],
    ['tag', '태그'], ['project', '프로젝트명'], ['purpose', '목적'],
  ];
  return cats.map(([v, l]) => `<option value="${v}" ${state.search.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function sortArrow(key) {
  if (state.sort.key !== key) return '';
  return state.sort.dir === 'asc' ? ' ▲' : ' ▼';
}

function renderQuoteRow(q, cols) {
  const p = q.papers || {};
  const cellFor = (key) => {
    switch (key) {
      case 'quote_text':
        return `<td data-label="인용문" class="quote-cell">${esc(truncate(q.quote_text, 80))}</td>`;
      case 'title':
        return `<td data-label="논문 제목"><a href="#/papers/${p.id}" class="paper-title-link">${esc(p.title || '(제목 없음)')}</a></td>`;
      case 'authors':
        return `<td data-label="저자">${(p.authors || []).map(a => `<span class="chip author-chip" data-author="${esc(a)}">${esc(a)}</span>`).join(' ') || '-'}</td>`;
      case 'year':
        return `<td data-label="발행연도">${p.year ?? '-'}</td>`;
      case 'project':
        return `<td data-label="프로젝트명">${p.project ? `<span class="chip project-chip" data-project="${esc(p.project)}">${esc(p.project)}</span>` : '-'}</td>`;
      case 'purpose':
        return `<td data-label="목적">${(q.purpose || []).map(x => `<span class="chip purpose-chip" data-purpose="${esc(x)}">${esc(x)}</span>`).join(' ') || '-'}</td>`;
      case 'tags':
        return `<td data-label="태그"><div class="tag-list">${(q.tags || []).map(t => `<span class="chip tag-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join('')}</div></td>`;
      case 'memo':
        return `<td data-label="메모">${esc(truncate(q.memo || '', 60))}</td>`;
      case 'created_at':
        return `<td data-label="추가한 날짜">${fmtDate(q.created_at)}</td>`;
      default:
        return '<td></td>';
    }
  };
  return `<tr class="quote-row" data-quote-id="${q.id}">${cols.map(c => cellFor(c.key)).join('')}</tr>`;
}

function renderQuoteList() {
  const rows = computeVisibleQuotes();
  const cols = COLUMN_DEFS.filter(c => state.columns[c.key]);

  const filterChips = [];
  if (state.filters.author) filterChips.push({ label: `저자: ${state.filters.author}`, key: 'author' });
  if (state.filters.project) filterChips.push({ label: `프로젝트: ${state.filters.project}`, key: 'project' });
  if (state.filters.tag) filterChips.push({ label: `태그: ${state.filters.tag}`, key: 'tag' });
  if (state.filters.purpose) filterChips.push({ label: `목적: ${state.filters.purpose}`, key: 'purpose' });

  root.innerHTML = `
    ${headerHtml()}
    <div class="toolbar">
      <select id="search-category">${searchCategoryOptions()}</select>
      <input type="text" id="search-term" class="search-input" placeholder="검색어 입력" value="${esc(state.search.term)}">
      <button id="add-quote-btn" class="btn-primary">+ 인용문 추가</button>
      <div class="columns-menu">
        <button id="columns-toggle-btn" class="btn" type="button">컬럼 설정</button>
        <div id="columns-panel" class="columns-panel" style="display:none">
          ${COLUMN_DEFS.map(c => `<label><input type="checkbox" data-col="${c.key}" ${state.columns[c.key] ? 'checked' : ''}> ${esc(c.label)}</label>`).join('')}
        </div>
      </div>
    </div>
    ${filterChips.length ? `<div class="chips-row">${filterChips.map(c => `<span class="chip filter-chip">${esc(c.label)} <button type="button" data-clear-filter="${c.key}">×</button></span>`).join('')}</div>` : ''}
    ${rows.length === 0
      ? `<div class="empty-state">${state.allQuotes.length === 0 ? '아직 저장된 인용문이 없습니다. 논문을 추가하고 인용문을 등록해보세요.' : '조건에 맞는 인용문이 없습니다.'}</div>`
      : `<div class="table-scroll"><table>
          <thead><tr>${cols.map(c => `<th class="${SORTABLE_KEYS.has(c.key) ? 'sortable' : ''}" data-sort="${c.key}">${esc(c.label)}${sortArrow(c.key)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(q => renderQuoteRow(q, cols)).join('')}</tbody>
        </table></div>`}
  `;
  bindHeader();
  bindQuoteListEvents();
}

function bindQuoteListEvents() {
  document.getElementById('search-category').addEventListener('change', (e) => {
    state.search.category = e.target.value;
    renderQuoteList();
  });
  document.getElementById('search-term').addEventListener('input', debounce((e) => {
    state.search.term = e.target.value;
    const caretPos = e.target.selectionStart;
    renderQuoteList();
    const el = document.getElementById('search-term');
    if (el) { el.focus(); el.setSelectionRange(caretPos, caretPos); }
  }, 250));

  document.getElementById('add-quote-btn').addEventListener('click', () => openAddQuoteModal());

  const colsBtn = document.getElementById('columns-toggle-btn');
  const colsPanel = document.getElementById('columns-panel');
  colsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colsPanel.style.display = colsPanel.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { colsPanel.style.display = 'none'; }, { once: true });
  colsPanel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => {
      state.columns[e.target.dataset.col] = e.target.checked;
      saveColumns();
      renderQuoteList();
    });
  });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort.key = key; state.sort.dir = key === 'created_at' ? 'desc' : 'asc'; }
      renderQuoteList();
    });
  });

  document.querySelectorAll('[data-clear-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.filters[btn.dataset.clearFilter] = null;
      renderQuoteList();
    });
  });

  const chipFilterMap = [
    ['.author-chip', 'author', 'author'],
    ['.project-chip', 'project', 'project'],
    ['.tag-chip', 'tag', 'tag'],
    ['.purpose-chip', 'purpose', 'purpose'],
  ];
  chipFilterMap.forEach(([selector, filterKey, dataKey]) => {
    document.querySelectorAll(selector).forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        state.filters[filterKey] = chip.dataset[dataKey];
        renderQuoteList();
      });
    });
  });

  document.querySelectorAll('tr.quote-row').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, .chip')) return;
      openQuoteDetailModal(tr.dataset.quoteId);
    });
  });
}

// ---------- Quote modals ----------
function paperSearchFieldHtml(idPrefix, presetPaperId) {
  const preset = presetPaperId ? state.papers.find(p => p.id === presetPaperId) : null;
  return `
    <div class="field paper-search-field">
      <label>논문 *</label>
      <input type="text" id="${idPrefix}-search" autocomplete="off" placeholder="논문 제목이나 저자로 검색" value="${preset ? esc(preset.title) : ''}">
      <input type="hidden" id="${idPrefix}-id" value="${preset ? preset.id : ''}">
      <div id="${idPrefix}-results" class="paper-search-results" style="display:none"></div>
    </div>
  `;
}

function bindPaperSearchField(idPrefix) {
  const input = document.getElementById(`${idPrefix}-search`);
  const hidden = document.getElementById(`${idPrefix}-id`);
  const results = document.getElementById(`${idPrefix}-results`);

  function renderResults(term) {
    const t = term.trim().toLowerCase();
    const matches = (t
      ? state.papers.filter(p => p.title.toLowerCase().includes(t) || (p.authors || []).some(a => a.toLowerCase().includes(t)))
      : state.papers
    ).slice(0, 8);
    results.innerHTML = matches.length === 0
      ? `<div class="paper-search-empty">검색 결과 없음</div>`
      : matches.map(p => `
          <div class="paper-search-item" data-paper-id="${p.id}" data-paper-title="${esc(p.title)}">
            <div>${esc(p.title)}</div>
            <div class="hint">${(p.authors || []).join(', ') || '저자 미상'}${p.year ? ' · ' + p.year : ''}</div>
          </div>
        `).join('');
    results.style.display = 'block';
  }

  input.addEventListener('focus', () => renderResults(input.value));
  input.addEventListener('input', () => {
    hidden.value = '';
    renderResults(input.value);
  });
  results.addEventListener('click', (e) => {
    const item = e.target.closest('.paper-search-item');
    if (!item) return;
    hidden.value = item.dataset.paperId;
    input.value = item.dataset.paperTitle;
    results.style.display = 'none';
  });
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (!e.target.closest('.paper-search-field')) results.style.display = 'none';
  });
}

function openAddQuoteModal(presetPaperId) {
  if (state.papers.length === 0) {
    alert('먼저 논문을 추가해주세요.');
    location.hash = '#/papers/new';
    return;
  }
  showModal(`
    <h2>인용문 추가</h2>
    <form id="quote-form">
      ${paperSearchFieldHtml('quote-paper', presetPaperId)}
      <div class="field"><label>인용문 *</label><textarea id="quote-text" required></textarea></div>
      <div class="field"><label>메모</label><textarea id="quote-memo"></textarea></div>
      <div class="field"><label>태그 (쉼표로 구분)</label><input type="text" id="quote-tags" placeholder="예: idiom, methodology"></div>
      <div class="field">
        <label>목적</label>
        <div class="checkbox-row">
          ${PURPOSE_OPTIONS.map(p => `<label><input type="checkbox" name="purpose" value="${esc(p)}"> ${esc(p)}</label>`).join('')}
        </div>
      </div>
      <div class="error-msg" id="quote-form-error"></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button type="button" class="btn" id="quote-cancel-btn">취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);
  bindPaperSearchField('quote-paper');
  document.getElementById('quote-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('quote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const paper_id = document.getElementById('quote-paper-id').value;
    const quote_text = document.getElementById('quote-text').value.trim();
    const memo = document.getElementById('quote-memo').value.trim();
    const tags = parseCommaList(document.getElementById('quote-tags').value);
    const purpose = Array.from(document.querySelectorAll('input[name=purpose]:checked')).map(cb => cb.value);
    if (!paper_id) { document.getElementById('quote-form-error').textContent = '논문을 목록에서 선택해주세요.'; return; }
    if (!quote_text) { document.getElementById('quote-form-error').textContent = '인용문을 입력해주세요.'; return; }
    const { error } = await supabase.from('quotes').insert({ paper_id, quote_text, memo: memo || null, tags, purpose });
    if (error) { document.getElementById('quote-form-error').textContent = error.message; return; }
    await reloadQuotes();
    closeModal();
    route();
  });
}

function openQuoteDetailModal(quoteId) {
  const q = state.allQuotes.find(x => x.id === quoteId);
  if (!q) return;
  const p = q.papers || {};
  showModal(`
    <h2>인용문 상세</h2>
    <div class="paper-meta"><a href="#/papers/${p.id}">${esc(p.title || '(제목 없음)')}</a> · ${(p.authors || []).join(', ') || '저자 미상'} ${p.year ? '· ' + p.year : ''} ${p.project ? '· ' + esc(p.project) : ''}</div>
    <div class="quote-full">${esc(q.quote_text)}</div>
    ${q.memo ? `<div><strong>메모</strong><div>${esc(q.memo)}</div></div>` : ''}
    <div class="tag-list" style="margin-top:8px;">
      ${(q.purpose || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}
      ${(q.tags || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}
    </div>
    <div class="hint" style="margin-top:10px;">추가한 날짜: ${fmtDate(q.created_at)}</div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button type="button" class="btn" id="quote-edit-btn">수정</button>
      <button type="button" class="btn btn-danger" id="quote-delete-btn">삭제</button>
    </div>
  `);
  document.getElementById('quote-edit-btn').addEventListener('click', () => openEditQuoteModal(q));
  document.getElementById('quote-delete-btn').addEventListener('click', async () => {
    if (!confirm('이 인용문을 삭제할까요?')) return;
    const { error } = await supabase.from('quotes').delete().eq('id', q.id);
    if (error) { alert(error.message); return; }
    await reloadQuotes();
    closeModal();
    route();
  });
}

function openEditQuoteModal(q) {
  showModal(`
    <h2>인용문 수정</h2>
    <form id="quote-edit-form">
      <div class="field"><label>인용문 *</label><textarea id="edit-quote-text" required>${esc(q.quote_text)}</textarea></div>
      <div class="field"><label>메모</label><textarea id="edit-quote-memo">${esc(q.memo || '')}</textarea></div>
      <div class="field"><label>태그 (쉼표로 구분)</label><input type="text" id="edit-quote-tags" value="${esc((q.tags || []).join(', '))}"></div>
      <div class="field">
        <label>목적</label>
        <div class="checkbox-row">
          ${PURPOSE_OPTIONS.map(p => `<label><input type="checkbox" name="edit-purpose" value="${esc(p)}" ${(q.purpose || []).includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}
        </div>
      </div>
      <div class="error-msg" id="edit-quote-form-error"></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button type="button" class="btn" id="edit-quote-cancel-btn">취소</button>
        <button type="submit" class="btn-primary">저장</button>
      </div>
    </form>
  `);
  document.getElementById('edit-quote-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('quote-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const quote_text = document.getElementById('edit-quote-text').value.trim();
    const memo = document.getElementById('edit-quote-memo').value.trim();
    const tags = parseCommaList(document.getElementById('edit-quote-tags').value);
    const purpose = Array.from(document.querySelectorAll('input[name=edit-purpose]:checked')).map(cb => cb.value);
    if (!quote_text) { document.getElementById('edit-quote-form-error').textContent = '인용문을 입력해주세요.'; return; }
    const { error } = await supabase.from('quotes').update({ quote_text, memo: memo || null, tags, purpose }).eq('id', q.id);
    if (error) { document.getElementById('edit-quote-form-error').textContent = error.message; return; }
    await reloadQuotes();
    closeModal();
    route();
  });
}

// ---------- Paper form ----------
function renderPaperForm(paperId) {
  const editing = !!paperId;
  const paper = editing ? state.papers.find(p => p.id === paperId) : null;
  if (editing && !paper) { location.hash = '#/'; return; }
  root.innerHTML = `
    ${headerHtml()}
    <h2>${editing ? '논문 수정' : '논문 추가'}</h2>
    <div class="panel">
      <form id="paper-form">
        <div class="field"><label>제목 *</label><input type="text" id="paper-title" required value="${esc(paper?.title || '')}"></div>
        <div class="field"><label>저자 (쉼표로 구분, 한 명씩 입력)</label><input type="text" id="paper-authors" placeholder="예: Jane Kim, John Smith" value="${esc((paper?.authors || []).join(', '))}"></div>
        <div class="field"><label>저널/학회</label><input type="text" id="paper-venue" value="${esc(paper?.venue || '')}"></div>
        <div class="field"><label>발행연도</label><input type="number" id="paper-year" value="${paper?.year ?? ''}"></div>
        <div class="field"><label>프로젝트명</label><input type="text" id="paper-project" value="${esc(paper?.project || '')}"></div>
        <div class="field"><label>출처 URL</label><input type="url" id="paper-url" value="${esc(paper?.source_url || '')}"></div>
        <div class="field"><label>메모</label><textarea id="paper-notes">${esc(paper?.notes || '')}</textarea></div>
        <div class="error-msg" id="paper-form-error"></div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <a href="${editing ? '#/papers/' + paperId : '#/'}" class="btn">취소</a>
          <button type="submit" class="btn-primary">저장</button>
        </div>
      </form>
    </div>
  `;
  bindHeader();
  document.getElementById('paper-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('paper-title').value.trim(),
      authors: parseCommaList(document.getElementById('paper-authors').value),
      venue: document.getElementById('paper-venue').value.trim() || null,
      year: document.getElementById('paper-year').value ? parseInt(document.getElementById('paper-year').value, 10) : null,
      project: document.getElementById('paper-project').value.trim() || null,
      source_url: document.getElementById('paper-url').value.trim() || null,
      notes: document.getElementById('paper-notes').value.trim() || null,
    };
    if (!payload.title) { document.getElementById('paper-form-error').textContent = '제목을 입력해주세요.'; return; }
    let result;
    if (editing) result = await supabase.from('papers').update(payload).eq('id', paperId);
    else result = await supabase.from('papers').insert(payload).select().single();
    if (result.error) { document.getElementById('paper-form-error').textContent = result.error.message; return; }
    await reloadPapers();
    await reloadQuotes();
    location.hash = editing ? `#/papers/${paperId}` : `#/papers/${result.data.id}`;
  });
}

// ---------- Papers list ----------
function renderPapersList() {
  root.innerHTML = `
    ${headerHtml()}
    <h2 class="section-heading">논문 목록</h2>
    ${state.papers.length === 0 ? `<div class="empty-state">아직 추가된 논문이 없습니다.</div>` : `
    <div class="table-scroll"><table>
      <thead><tr><th>제목</th><th>저자</th><th>저널/학회</th><th>발행연도</th></tr></thead>
      <tbody>
        ${state.papers.map(p => `
          <tr class="quote-row" data-paper-id="${p.id}">
            <td data-label="제목"><a href="#/papers/${p.id}" class="paper-title-link">${esc(p.title)}</a></td>
            <td data-label="저자">${(p.authors || []).join(', ') || '-'}</td>
            <td data-label="저널/학회">${esc(p.venue || '-')}</td>
            <td data-label="발행연도">${p.year ?? '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
    `}
  `;
  bindHeader();
  document.querySelectorAll('tr[data-paper-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = `#/papers/${tr.dataset.paperId}`;
    });
  });
}

// ---------- Paper detail ----------
function renderPaperDetail(paperId) {
  const paper = state.papers.find(p => p.id === paperId);
  if (!paper) {
    root.innerHTML = `${headerHtml()}<div class="empty-state">논문을 찾을 수 없습니다.</div>`;
    bindHeader();
    return;
  }
  const quotes = state.allQuotes.filter(q => q.paper_id === paperId);
  root.innerHTML = `
    ${headerHtml()}
    <div class="panel">
      <h2 class="paper-detail-title">${esc(paper.title)}</h2>
      <div class="paper-meta">${(paper.authors || []).join(', ') || '저자 미상'} ${paper.year ? '· ' + paper.year : ''} ${paper.venue ? '· ' + esc(paper.venue) : ''}</div>
      ${paper.project ? `<div class="paper-meta">프로젝트: ${esc(paper.project)}</div>` : ''}
      ${paper.source_url ? `<div class="paper-meta"><a href="${esc(paper.source_url)}" target="_blank" rel="noopener">${esc(paper.source_url)}</a></div>` : ''}
      ${paper.notes ? `<div class="paper-meta">메모: ${esc(paper.notes)}</div>` : ''}
      <div style="display:flex; gap:8px; margin-top:12px;">
        <a href="#/papers/${paperId}/edit" class="btn">논문 정보 수정</a>
        <button id="delete-paper-btn" class="btn btn-danger" type="button">논문 삭제</button>
      </div>
    </div>

    <h3>인용문 (${quotes.length})</h3>
    <div class="panel">
      <button id="add-quote-here-btn" class="btn-primary" type="button" style="margin-bottom:12px;">+ 이 논문에 인용문 추가</button>
      ${quotes.length === 0 ? `<div class="empty-state">아직 인용문이 없습니다.</div>` : quotes.map(q => `
        <div class="quote-list-item">
          <div class="quote-full" style="font-size:14px; margin:4px 0; cursor:pointer;" data-quote-id="${q.id}">${esc(q.quote_text)}</div>
          <div class="tag-list">
            ${(q.purpose || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}
            ${(q.tags || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}
          </div>
          <div class="hint">${fmtDate(q.created_at)}</div>
        </div>
      `).join('')}
    </div>
  `;
  bindHeader();
  document.getElementById('delete-paper-btn').addEventListener('click', async () => {
    if (!confirm('이 논문과 관련된 모든 인용문이 함께 삭제됩니다. 계속할까요?')) return;
    const { error } = await supabase.from('papers').delete().eq('id', paperId);
    if (error) { alert(error.message); return; }
    await reloadPapers();
    await reloadQuotes();
    location.hash = '#/';
  });
  document.getElementById('add-quote-here-btn').addEventListener('click', () => openAddQuoteModal(paperId));
  document.querySelectorAll('[data-quote-id]').forEach(el => {
    el.addEventListener('click', () => openQuoteDetailModal(el.dataset.quoteId));
  });
}

// ---------- Init ----------
async function init() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase fires this on background token refresh too (e.g. when switching
    // browser tabs and coming back) - only re-render when login state actually changes,
    // otherwise an in-progress form gets wiped out from under the user.
    const hadSession = !!state.session;
    const hasSession = !!session;
    state.session = session;
    if (hadSession !== hasSession) {
      state.loaded = false;
      route();
    }
  });
  window.addEventListener('hashchange', route);
  route();
}

init();
