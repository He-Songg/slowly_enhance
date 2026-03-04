const POPUP_THEMES = {
  purple: { '--primary': '#667eea', '--primary-dark': '#764ba2', '--primary-light': '#a78bfa', '--primary-bg': '#f8f9ff', '--bg': '#f8f9fa', '--card-bg': 'white', '--text': '#333', '--text-muted': '#999' },
  orange: { '--primary': '#f59e0b', '--primary-dark': '#d97706', '--primary-light': '#fbbf24', '--primary-bg': '#fffbeb', '--bg': '#faf5ee', '--card-bg': 'white', '--text': '#333', '--text-muted': '#999' },
  teal: { '--primary': '#14b8a6', '--primary-dark': '#0d9488', '--primary-light': '#5eead4', '--primary-bg': '#f0fdfa', '--bg': '#f0faf8', '--card-bg': 'white', '--text': '#333', '--text-muted': '#999' },
  rose: { '--primary': '#f43f5e', '--primary-dark': '#be123c', '--primary-light': '#fb7185', '--primary-bg': '#fff1f2', '--bg': '#fdf2f4', '--card-bg': 'white', '--text': '#333', '--text-muted': '#999' }
};

function applyPopupTheme(themeId) {
  const vars = POPUP_THEMES[themeId];
  if (!vars) return;
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(vars)) {
    root.style.setProperty(prop, val);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await chrome.storage.local.get('theme');
    const t = result.theme;
    if (POPUP_THEMES[t]) applyPopupTheme(t);
    else applyPopupTheme('purple');
  } catch {}

  const contentEl = document.getElementById('content');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnStats = document.getElementById('btnStats');
  const btnClear = document.getElementById('btnClear');
  const btnOpenSlowly = document.getElementById('btnOpenSlowly');
  const btnOpenGithub = document.getElementById('btnOpenGithub');
  const lastCollectedText = document.getElementById('lastCollectedText');

  if (btnOpenSlowly) {
    btnOpenSlowly.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://web.slowly.app/' });
    });
  }
  if (btnOpenGithub) {
    btnOpenGithub.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/He-Songg/slowly_enhance' });
    });
  }

  const tab = await getSlowlyTab();

  if (!tab) {
    statusDot.classList.add('inactive');
    statusText.textContent = '未检测到 Slowly 页面';
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>请先打开 <a href="https://web.slowly.app/" target="_blank" style="color:var(--primary)">web.slowly.app</a> 并登录<br>
        然后浏览好友和信件，数据将自动收集</p>
      </div>`;
    return;
  }

  statusDot.classList.add('active');
  statusText.textContent = 'Slowly 页面已连接';

  try {
    const cs = await sendToTab(tab.id, { action: 'getCollectionStatus' }).catch(() => null);
    if (cs?.lastCollectedAt && lastCollectedText) {
      lastCollectedText.style.display = 'block';
      lastCollectedText.textContent = `数据截止于：${formatDateTime(cs.lastCollectedAt)}`;
    }
    const overview = await sendToTab(tab.id, { action: 'getOverview' });
    renderOverview(overview);
  } catch (err) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>暂无数据，按以下步骤开始收集：<br>
        1）打开 Slowly 并登录<br>
        2）进入好友列表（Friends）<br>
        3）进入任意好友对话并下拉/翻页加载历史信件</p>
      </div>`;
  }

  btnStats.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openStats' });
  });

  btnClear.addEventListener('click', async () => {
    if (!confirm('确定要清除所有已收集的数据吗？')) return;
    await sendToTab(tab.id, { action: 'clearData' });
    location.reload();
  });
});

function animateValue(el, to, formatter, durationMs = 550) {
  const start = performance.now();
  const from = 0;
  const fmt = formatter || (v => String(v));
  function tick(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + (to - from) * eased);
    el.textContent = fmt(v);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderOverview(data) {
  if (!data || data.totalLetters === 0) {
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>暂无数据，按以下步骤开始收集：<br>
        1）打开 Slowly 并登录<br>
        2）进入好友列表（Friends）<br>
        3）进入任意好友对话并下拉/翻页加载历史信件</p>
      </div>`;
    return;
  }

  let html = `<div class="overview">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">总信件数</div>
        <div class="value" data-anim="num" data-raw="${data.totalLetters}" data-kind="int">0</div>
      </div>
      <div class="stat-card">
        <div class="label">收 / 发</div>
        <div class="value">${data.totalReceived} <small>/</small> ${data.totalSent}</div>
      </div>
      <div class="stat-card">
        <div class="label">总字数</div>
        <div class="value" data-anim="num" data-raw="${data.totalWords}" data-kind="word">0</div>
      </div>
      <div class="stat-card">
        <div class="label">图片 / 语音</div>
        <div class="value">${data.totalImages} <small>/</small> ${data.totalAudio}</div>
      </div>
    </div>
    <div class="stat-grid" style="margin-top:0">
      <div class="stat-card">
        <div class="label">正常好友</div>
        <div class="value" data-anim="num" data-raw="${data.totalFriends}" data-kind="int">0</div>
      </div>
      <div class="stat-card">
        <div class="label">隐藏 / 删除</div>
        <div class="value">${data.hiddenFriends || 0} <small>/</small> ${data.removedFriends || 0}</div>
      </div>
    </div>`;

  if (data.friendRanking?.length > 0) {
    html += `<div class="section-title">
      好友排行（按信件数）
      <a id="linkAllStats">查看全部 →</a>
    </div>
    <div class="friend-list">`;

    const top = data.friendRanking.slice(0, 10);
    top.forEach(f => {
      const initial = (f.name || '?')[0].toUpperCase();
      const badge = f.status === 'hidden' ? '<span style="color:#ff9800;font-size:10px;margin-left:4px">隐藏</span>'
        : f.status === 'removed' ? '<span style="color:#f44336;font-size:10px;margin-left:4px">已删除</span>' : '';
      html += `
        <div class="friend-item" data-id="${f.id}">
          <div class="friend-avatar">${initial}</div>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(f.name)}${badge}</div>
            <div class="friend-meta">${f.wordCount} 字 · ${f.imageCount} 图 · ${f.audioCount} 音</div>
          </div>
          <div class="friend-count">${f.letterCount}</div>
        </div>`;
    });

    html += '</div>';
  }

  html += '</div>';
  document.getElementById('content').innerHTML = html;

  document.querySelectorAll('[data-anim="num"]').forEach(el => {
    const raw = Number(el.dataset.raw || '0');
    const kind = el.dataset.kind || 'int';
    const fmt = kind === 'word' ? formatNumber : (v => String(v));
    animateValue(el, Number.isFinite(raw) ? raw : 0, fmt);
  });

  document.querySelectorAll('.friend-item').forEach(el => {
    el.addEventListener('click', () => {
      const friendId = el.dataset.id;
      chrome.runtime.sendMessage({ action: 'openStats', friendId });
    });
  });

  const linkAll = document.getElementById('linkAllStats');
  if (linkAll) {
    linkAll.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openStats' });
    });
  }
}

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(iso);
  }
}

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function getSlowlyTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.slowly.app/*' });
  return tabs[0] || null;
}

function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}
