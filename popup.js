document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnStats = document.getElementById('btnStats');
  const btnClear = document.getElementById('btnClear');

  const tab = await getSlowlyTab();

  if (!tab) {
    statusDot.classList.add('inactive');
    statusText.textContent = '未检测到 Slowly 页面';
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>请先打开 <a href="https://web.slowly.app/" target="_blank" style="color:#667eea">web.slowly.app</a> 并登录<br>
        然后浏览好友和信件，数据将自动收集</p>
      </div>`;
    return;
  }

  statusDot.classList.add('active');
  statusText.textContent = 'Slowly 页面已连接';

  try {
    const overview = await sendToTab(tab.id, { action: 'getOverview' });
    renderOverview(overview);
  } catch (err) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>暂无数据<br>请在 Slowly 中浏览好友和信件<br>数据将在浏览时自动收集</p>
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

function renderOverview(data) {
  if (!data || data.totalLetters === 0) {
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="icon">📮</div>
        <p>暂无数据<br>请在 Slowly 中浏览好友和信件<br>数据将在浏览时自动收集</p>
      </div>`;
    return;
  }

  let html = `<div class="overview">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">总信件数</div>
        <div class="value">${data.totalLetters}</div>
      </div>
      <div class="stat-card">
        <div class="label">收 / 发</div>
        <div class="value">${data.totalReceived} <small>/</small> ${data.totalSent}</div>
      </div>
      <div class="stat-card">
        <div class="label">总字数</div>
        <div class="value">${formatNumber(data.totalWords)}</div>
      </div>
      <div class="stat-card">
        <div class="label">图片 / 语音</div>
        <div class="value">${data.totalImages} <small>/</small> ${data.totalAudio}</div>
      </div>
    </div>
    <div class="stat-grid" style="margin-top:0">
      <div class="stat-card">
        <div class="label">正常好友</div>
        <div class="value">${data.totalFriends}</div>
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
