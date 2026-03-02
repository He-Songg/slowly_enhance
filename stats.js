let cachedOverview = null;
let cachedFriendStats = {};
let currentView = 'overview';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId');

  const tab = await getSlowlyTab();
  if (!tab) {
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-msg">请先打开 web.slowly.app 并浏览信件以收集数据</div>';
    return;
  }

  try {
    cachedOverview = await sendToTab(tab.id, { action: 'getOverview' });
    renderTabs(cachedOverview, friendId);

    if (friendId) {
      await showFriendDetail(tab.id, parseInt(friendId));
    } else {
      showOverview();
    }
  } catch (err) {
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-msg">数据加载失败，请确保已在 Slowly 中浏览过信件</div>';
  }
});

function renderTabs(overview, activeFriendId) {
  const tabsEl = document.getElementById('tabs');
  let html = `<div class="tab ${!activeFriendId ? 'active' : ''}" data-view="overview">总览</div>`;

  if (overview.friendRanking) {
    overview.friendRanking.forEach(f => {
      const isActive = activeFriendId && parseInt(activeFriendId) === f.id;
      const dot = f.status === 'hidden' ? ' 🙈' : f.status === 'removed' ? ' 🗑' : '';
      html += `<div class="tab ${isActive ? 'active' : ''}" data-view="friend" data-id="${f.id}">${escapeHtml(f.name)}${dot}</div>`;
    });
  }

  tabsEl.innerHTML = html;
  tabsEl.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const slowlyTab = await getSlowlyTab();
      if (!slowlyTab) return;

      if (tab.dataset.view === 'overview') {
        showOverview();
      } else {
        await showFriendDetail(slowlyTab.id, parseInt(tab.dataset.id));
      }
    });
  });
}

function showOverview() {
  const data = cachedOverview;
  if (!data || data.totalLetters === 0) {
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-msg">暂无数据，请在 Slowly 中浏览好友信件</div>';
    return;
  }

  const hiddenCount = data.hiddenFriends || 0;
  const removedCount = data.removedFriends || 0;
  const extraInfo = [];
  if (hiddenCount > 0) extraInfo.push(`${hiddenCount} 隐藏`);
  if (removedCount > 0) extraInfo.push(`${removedCount} 已删除`);
  const extraStr = extraInfo.length > 0 ? ` (${extraInfo.join('、')})` : '';

  document.getElementById('topSub').textContent =
    `共 ${data.totalFriends} 位好友${extraStr} · ${data.totalLetters} 封信件`;

  let html = `
    <div class="card">
      <div class="card-title">数据总览</div>
      <div class="stat-row stat-row-3">
        <div class="stat-item">
          <div class="num">${data.totalLetters}</div>
          <div class="label">总信件数</div>
        </div>
        <div class="stat-item">
          <div class="num">${data.totalSent}</div>
          <div class="label">发出</div>
        </div>
        <div class="stat-item">
          <div class="num">${data.totalReceived}</div>
          <div class="label">收到</div>
        </div>
      </div>
      <div class="stat-row stat-row-3" style="margin-top:12px">
        <div class="stat-item">
          <div class="num">${formatNumber(data.totalWords)}</div>
          <div class="label">总字数</div>
        </div>
        <div class="stat-item">
          <div class="num">${data.totalImages}</div>
          <div class="label">图片</div>
        </div>
        <div class="stat-item">
          <div class="num">${data.totalAudio}</div>
          <div class="label">语音</div>
        </div>
      </div>
      <div class="stat-row stat-row-3" style="margin-top:12px">
        <div class="stat-item">
          <div class="num">${data.totalFriends}</div>
          <div class="label">正常好友</div>
        </div>
        <div class="stat-item">
          <div class="num">${hiddenCount}</div>
          <div class="label">隐藏好友</div>
        </div>
        <div class="stat-item">
          <div class="num">${removedCount}</div>
          <div class="label">已删除好友</div>
        </div>
      </div>
    </div>`;

  if (data.friendRanking?.length > 0) {
    const maxLetters = data.friendRanking[0].letterCount;

    html += `
    <div class="card">
      <div class="card-title">
        好友信件排行
        <button class="export-btn" id="exportBtn">导出 CSV</button>
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#667eea"></div> 发出</div>
        <div class="legend-item"><div class="legend-dot" style="background:#c4b5fd"></div> 收到</div>
      </div>
      <div class="bar-chart">`;

    data.friendRanking.forEach(f => {
      const sentPct = (f.sentCount / maxLetters * 100).toFixed(1);
      const recvPct = (f.receivedCount / maxLetters * 100).toFixed(1);
      const statusTag = f.status === 'hidden' ? ' <span style="color:#ff9800;font-size:11px">隐藏</span>'
        : f.status === 'removed' ? ' <span style="color:#f44336;font-size:11px">已删除</span>' : '';
      html += `
        <div class="bar-row">
          <div class="bar-label" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}${statusTag}</div>
          <div class="bar-track">
            <div class="bar-fill-sent" style="width:${sentPct}%"></div>
            <div class="bar-fill-received" style="width:${recvPct}%"></div>
          </div>
          <div class="bar-value">${f.letterCount}</div>
        </div>`;
    });

    html += '</div></div>';

    html += `
    <div class="card">
      <div class="card-title">详细数据表</div>
      <table class="detail-table">
        <thead>
          <tr>
            <th>好友</th>
            <th>状态</th>
            <th>信件数</th>
            <th>发出</th>
            <th>收到</th>
            <th>字数</th>
            <th>图片</th>
            <th>语音</th>
          </tr>
        </thead>
        <tbody>`;

    data.friendRanking.forEach(f => {
      const statusLabel = f.status === 'hidden'
        ? '<span style="color:#ff9800">隐藏</span>'
        : f.status === 'removed'
        ? '<span style="color:#f44336">已删除</span>'
        : '<span style="color:#4caf50">正常</span>';
      html += `
        <tr>
          <td><strong>${escapeHtml(f.name)}</strong></td>
          <td>${statusLabel}</td>
          <td>${f.letterCount}</td>
          <td>${f.sentCount}</td>
          <td>${f.receivedCount}</td>
          <td>${formatNumber(f.wordCount)}</td>
          <td>${f.imageCount}</td>
          <td>${f.audioCount}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
  }

  document.getElementById('mainContent').innerHTML = html;

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportCSV(data));
  }

  loadAdvancedOverview();
}

async function loadAdvancedOverview() {
  const tab = await getSlowlyTab();
  if (!tab) return;
  try {
    const adv = await sendToTab(tab.id, { action: 'getAdvancedStats' });
    if (!adv) return;
    const container = document.getElementById('mainContent');

    container.insertAdjacentHTML('beforeend', renderHeatmap(adv.heatmap));
    container.insertAdjacentHTML('beforeend', renderStamps(adv));
    container.insertAdjacentHTML('beforeend', renderWordTrend(adv.wordTrend));
    container.insertAdjacentHTML('beforeend', renderReplyTrend(adv.replyTrend));
    container.insertAdjacentHTML('beforeend', renderHourStats(adv.hourStats));
    container.insertAdjacentHTML('beforeend', renderCountryStats(adv));
    container.insertAdjacentHTML('beforeend', renderExportSection());
    bindExportButtons(tab.id);
  } catch(e) {
    console.warn('[Slowly Enhance] 高级统计加载失败:', e);
  }
}

async function showFriendDetail(tabId, friendId) {
  if (!cachedFriendStats[friendId]) {
    cachedFriendStats[friendId] = await sendToTab(tabId, { action: 'getStats', friendId });
  }

  const stats = cachedFriendStats[friendId];
  if (!stats) {
    document.getElementById('mainContent').innerHTML =
      '<div class="empty-msg">该好友暂无信件数据，请在 Slowly 中浏览该好友的信件</div>';
    return;
  }

  const friend = cachedOverview.friendRanking?.find(f => f.id === friendId);
  const name = friend?.name || `好友 #${friendId}`;
  document.getElementById('topSub').textContent = `与 ${name} 的通信统计`;

  let html = `
    <div class="card">
      <div class="card-title">通信概览</div>
      <div class="stat-row">
        <div class="stat-item">
          <div class="num">${stats.totalLetters}</div>
          <div class="label">总信件</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.sentCount}</div>
          <div class="label">我发出</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.receivedCount}</div>
          <div class="label">收到</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.communicationDays}</div>
          <div class="label">通信天数</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">文字统计</div>
      <div class="stat-row">
        <div class="stat-item">
          <div class="num">${formatNumber(stats.totalWords.total)}</div>
          <div class="label">总字数</div>
        </div>
        <div class="stat-item">
          <div class="num">${formatNumber(stats.sentWords.total)}</div>
          <div class="label">我写的</div>
        </div>
        <div class="stat-item">
          <div class="num">${formatNumber(stats.receivedWords.total)}</div>
          <div class="label">对方写的</div>
        </div>
        <div class="stat-item">
          <div class="num">${formatNumber(stats.totalWords.cn)}</div>
          <div class="label">中文字符</div>
        </div>
        <div class="stat-item">
          <div class="num">${formatNumber(stats.totalWords.en)}</div>
          <div class="label">英文单词</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">附件统计</div>
      <div class="stat-row">
        <div class="stat-item">
          <div class="num">${stats.totalImages}</div>
          <div class="label">总图片</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.sentAttachments.images}</div>
          <div class="label">我发的图</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.receivedAttachments.images}</div>
          <div class="label">收到的图</div>
        </div>
        <div class="stat-item">
          <div class="num">${stats.totalAudio}</div>
          <div class="label">语音消息</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">回信速度</div>
      <div class="stat-row">
        <div class="stat-item">
          <div class="num">${formatHours(stats.replyTime.myAvgHours)}</div>
          <div class="label">我的平均回信时间</div>
        </div>
        <div class="stat-item">
          <div class="num">${formatHours(stats.replyTime.friendAvgHours)}</div>
          <div class="label">对方平均回信时间</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">时间线</div>
      <div class="stat-row">
        <div class="stat-item">
          <div class="num" style="font-size:16px">${formatDate(stats.firstLetterDate)}</div>
          <div class="label">第一封信</div>
        </div>
        <div class="stat-item">
          <div class="num" style="font-size:16px">${formatDate(stats.lastLetterDate)}</div>
          <div class="label">最近一封</div>
        </div>
      </div>
    </div>`;

  document.getElementById('mainContent').innerHTML = html;

  loadAdvancedFriend(tabId, friendId);
}

async function loadAdvancedFriend(tabId, friendId) {
  try {
    const adv = await sendToTab(tabId, { action: 'getAdvancedStats', friendId });
    if (!adv) return;
    const container = document.getElementById('mainContent');

    container.insertAdjacentHTML('beforeend', renderHeatmap(adv.heatmap));
    container.insertAdjacentHTML('beforeend', renderStamps(adv));
    container.insertAdjacentHTML('beforeend', renderWordTrend(adv.wordTrend));
    container.insertAdjacentHTML('beforeend', renderReplyTrend(adv.replyTrend));
    container.insertAdjacentHTML('beforeend', renderHourStats(adv.hourStats));
  } catch(e) {
    console.warn('[Slowly Enhance] 好友高级统计加载失败:', e);
  }
}

function exportCSV(data) {
  if (!data.friendRanking?.length) return;

  const statusMap = { normal: '正常', hidden: '隐藏', removed: '已删除' };
  let csv = '\uFEFF好友,状态,信件数,发出,收到,字数,图片,语音\n';
  data.friendRanking.forEach(f => {
    csv += `${f.name},${statusMap[f.status] || '正常'},${f.letterCount},${f.sentCount},${f.receivedCount},${f.wordCount},${f.imageCount},${f.audioCount}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `slowly_stats_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatHours(h) {
  if (!h || h === 0) return '-';
  if (h < 1) return Math.round(h * 60) + '分';
  if (h < 24) return h.toFixed(1) + '时';
  return (h / 24).toFixed(1) + '天';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return '-'; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function getSlowlyTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.slowly.app/*' });
  return tabs[0] || null;
}

function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(response);
    });
  });
}

// ========== 热力图 ==========

function renderHeatmap(heatmap) {
  if (!heatmap || Object.keys(heatmap).length === 0) return '';

  const dates = Object.keys(heatmap).sort();
  const minDate = new Date(dates[0]);
  const maxDate = new Date(dates[dates.length - 1]);
  const maxCount = Math.max(...Object.values(heatmap).map(d => d.total));

  const startDate = new Date(minDate);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(maxDate);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const cells = [];
  const months = [];
  let lastMonth = -1;
  let weekIdx = 0;

  const cur = new Date(startDate);
  while (cur <= endDate) {
    const ds = cur.toISOString().substring(0, 10);
    const day = cur.getDay();

    if (day === 0) {
      const m = cur.getMonth();
      if (m !== lastMonth) {
        months.push({ label: (m + 1) + '月', week: weekIdx });
        lastMonth = m;
      }
    }

    const d = heatmap[ds];
    const count = d ? d.total : 0;
    const level = count === 0 ? 0 : count <= maxCount * 0.25 ? 1 : count <= maxCount * 0.5 ? 2 : count <= maxCount * 0.75 ? 3 : 4;
    const colors = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
    const tip = d ? `${ds}: ${d.sent}封发出, ${d.received}封收到` : ds;

    cells.push(`<div class="hm-cell" style="background:${colors[level]};grid-row:${day + 1}" title="${tip}"><span class="hm-tip">${tip}</span></div>`);

    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() === 0) weekIdx++;
  }

  const totalWeeks = weekIdx + 1;
  const monthLabels = months.map(m => {
    const left = (m.week / totalWeeks * 100).toFixed(1);
    return `<span style="position:absolute;left:${left}%">${m.label}</span>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">📅 通信热力图</div>
      <div class="heatmap-wrap">
        <div style="position:relative;height:18px;margin-bottom:4px">${monthLabels}</div>
        <div class="heatmap" style="grid-template-columns:repeat(${totalWeeks}, 14px)">
          ${cells.join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-top:10px;font-size:11px;color:#999">
        <span>少</span>
        <div style="width:12px;height:12px;background:#ebedf0;border-radius:2px"></div>
        <div style="width:12px;height:12px;background:#c6e48b;border-radius:2px"></div>
        <div style="width:12px;height:12px;background:#7bc96f;border-radius:2px"></div>
        <div style="width:12px;height:12px;background:#239a3b;border-radius:2px"></div>
        <div style="width:12px;height:12px;background:#196127;border-radius:2px"></div>
        <span>多</span>
      </div>
    </div>`;
}

// ========== 邮票统计 ==========

function stampImgUrl(name) {
  return `https://cdn.getslowly.com/assets/images/stamp-sm/${name}.png`;
}

function renderStamps(adv) {
  if (!adv.stampRanking || adv.stampRanking.length === 0) return '';

  const top20 = adv.stampRanking.slice(0, 20);

  let items = top20.map(s => `
    <div class="stamp-item">
      <img class="stamp-thumb" src="${stampImgUrl(s.name)}" alt="${escapeHtml(s.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
      <span class="stamp-icon" style="display:none">🎫</span>
      <span class="stamp-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
      <span class="stamp-count">${s.count}</span>
    </div>`).join('');

  return `
    <div class="card">
      <div class="card-title">🎫 邮票统计</div>
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat-item">
          <div class="num">${adv.stampTotal}</div>
          <div class="label">使用邮票总次数</div>
        </div>
        <div class="stat-item">
          <div class="num">${adv.stampUnique}</div>
          <div class="label">不同邮票种类</div>
        </div>
      </div>
      <div class="stamp-grid">${items}</div>
    </div>`;
}

// ========== 信件长度趋势 ==========

function renderWordTrend(wordTrend) {
  if (!wordTrend || wordTrend.length === 0) return '';

  const byMonth = {};
  wordTrend.forEach(w => {
    const month = w.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { sent: 0, received: 0, sentCount: 0, receivedCount: 0 };
    if (w.isMine) {
      byMonth[month].sent += w.words;
      byMonth[month].sentCount++;
    } else {
      byMonth[month].received += w.words;
      byMonth[month].receivedCount++;
    }
  });

  const months = Object.keys(byMonth).sort();
  if (months.length === 0) return '';

  const data = months.map(m => ({
    month: m,
    sentAvg: byMonth[m].sentCount > 0 ? Math.round(byMonth[m].sent / byMonth[m].sentCount) : 0,
    receivedAvg: byMonth[m].receivedCount > 0 ? Math.round(byMonth[m].received / byMonth[m].receivedCount) : 0
  }));

  const maxVal = Math.max(...data.map(d => Math.max(d.sentAvg, d.receivedAvg)), 1);
  const svgW = 800;
  const svgH = 150;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 25;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  function toX(i) { return padL + (i / Math.max(data.length - 1, 1)) * chartW; }
  function toY(v) { return padT + chartH - (v / maxVal) * chartH; }

  function polyline(key, color) {
    const pts = data.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  }

  const xLabels = data.map((d, i) => {
    if (data.length <= 12 || i % Math.ceil(data.length / 12) === 0) {
      return `<text x="${toX(i)}" y="${svgH - 2}" text-anchor="middle" font-size="10" fill="#999">${d.month.substring(2)}</text>`;
    }
    return '';
  }).join('');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const y = padT + chartH * (1 - pct);
    const val = Math.round(maxVal * pct);
    return `<line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#eee" stroke-width="1"/>
            <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#bbb">${val}</text>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">📈 信件长度趋势（月均字数）</div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#667eea"></div> 我写的</div>
        <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> 对方写的</div>
      </div>
      <svg class="trend-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
        ${gridLines}
        ${polyline('sentAvg', '#667eea')}
        ${polyline('receivedAvg', '#f59e0b')}
        ${xLabels}
      </svg>
    </div>`;
}

// ========== 国家/地区分布 ==========

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  const upper = code.toUpperCase();
  if (upper === 'TW') return '🇨🇳';
  return String.fromCodePoint(...[...upper].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ========== 回信速度趋势 ==========

function renderReplyTrend(replyTrend) {
  if (!replyTrend || Object.keys(replyTrend).length === 0) return '';

  const months = Object.keys(replyTrend).sort();
  const data = months.map(m => {
    const d = replyTrend[m];
    return {
      month: m,
      myAvg: d.myCount > 0 ? Math.round(d.myTotal / d.myCount * 10) / 10 : null,
      friendAvg: d.friendCount > 0 ? Math.round(d.friendTotal / d.friendCount * 10) / 10 : null
    };
  });

  const allVals = data.flatMap(d => [d.myAvg, d.friendAvg].filter(v => v !== null));
  if (allVals.length === 0) return '';
  const maxVal = Math.max(...allVals, 1);

  const svgW = 800;
  const svgH = 150;
  const padL = 50;
  const padR = 10;
  const padT = 10;
  const padB = 25;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  function toX(i) { return padL + (i / Math.max(data.length - 1, 1)) * chartW; }
  function toY(v) { return v === null ? null : padT + chartH - (v / maxVal) * chartH; }

  function polyline(key, color) {
    const pts = data
      .map((d, i) => ({ x: toX(i), y: toY(d[key]) }))
      .filter(p => p.y !== null);
    if (pts.length < 2) return '';
    return `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  }

  function dots(key, color) {
    return data.map((d, i) => {
      const y = toY(d[key]);
      if (y === null) return '';
      const label = formatHours(d[key]);
      return `<circle cx="${toX(i)}" cy="${y}" r="3" fill="${color}"><title>${d.month}: ${label}</title></circle>`;
    }).join('');
  }

  const xLabels = data.map((d, i) => {
    if (data.length <= 12 || i % Math.ceil(data.length / 12) === 0) {
      return `<text x="${toX(i)}" y="${svgH - 2}" text-anchor="middle" font-size="10" fill="#999">${d.month.substring(2)}</text>`;
    }
    return '';
  }).join('');

  function formatYLabel(hours) {
    if (hours < 24) return hours + 'h';
    return (hours / 24).toFixed(0) + 'd';
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const y = padT + chartH * (1 - pct);
    const val = maxVal * pct;
    return `<line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#eee" stroke-width="1"/>
            <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#bbb">${formatYLabel(val)}</text>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">⏱️ 回信速度趋势（月均）</div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#667eea"></div> 我的回信速度</div>
        <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> 对方回信速度</div>
      </div>
      <svg class="trend-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
        ${gridLines}
        ${polyline('myAvg', '#667eea')}
        ${polyline('friendAvg', '#f59e0b')}
        ${dots('myAvg', '#667eea')}
        ${dots('friendAvg', '#f59e0b')}
        ${xLabels}
      </svg>
    </div>`;
}

// ========== 活跃时段分析 ==========

function renderHourStats(hourStats) {
  if (!hourStats) return '';
  const maxVal = Math.max(...hourStats.my, ...hourStats.friend, 1);

  const bars = [];
  for (let h = 0; h < 24; h++) {
    const myH = (hourStats.my[h] / maxVal * 100).toFixed(1);
    const friendH = (hourStats.friend[h] / maxVal * 100).toFixed(1);
    const label = h % 3 === 0 ? `${String(h).padStart(2, '0')}` : '';
    const myTip = hourStats.my[h];
    const friendTip = hourStats.friend[h];
    bars.push(`
      <div class="hour-bar-group" title="${h}:00 - 我:${myTip}封 对方:${friendTip}封">
        <div class="hour-bar-stack" style="height:100%">
          <div style="flex:1"></div>
          <div class="hour-bar-friend" style="height:${friendH}%"></div>
          <div class="hour-bar-mine" style="height:${myH}%;border-radius:${friendH === '0.0' ? '3px 3px 0 0' : '0'}"></div>
        </div>
        <span class="hour-label">${label}</span>
      </div>`);
  }

  const myTotal = hourStats.my.reduce((a, b) => a + b, 0);
  const friendTotal = hourStats.friend.reduce((a, b) => a + b, 0);
  const myPeak = hourStats.my.indexOf(Math.max(...hourStats.my));
  const friendPeak = hourStats.friend.indexOf(Math.max(...hourStats.friend));

  return `
    <div class="card">
      <div class="card-title">🕐 活跃时段分析</div>
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat-item">
          <div class="num">${String(myPeak).padStart(2, '0')}:00</div>
          <div class="label">我最活跃时段</div>
        </div>
        <div class="stat-item">
          <div class="num">${String(friendPeak).padStart(2, '0')}:00</div>
          <div class="label">对方最活跃时段</div>
        </div>
        <div class="stat-item">
          <div class="num">${myTotal}</div>
          <div class="label">我写的信</div>
        </div>
        <div class="stat-item">
          <div class="num">${friendTotal}</div>
          <div class="label">对方写的信</div>
        </div>
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#667eea"></div> 我</div>
        <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> 对方</div>
      </div>
      <div class="hour-chart">${bars.join('')}</div>
    </div>`;
}

// ========== 数据导出 ==========

function renderExportSection() {
  return `
    <div class="card">
      <div class="card-title">💾 数据备份与导出</div>
      <p style="font-size:13px;color:#666;margin-bottom:16px">将所有收集到的信件数据导出为文件，方便备份或在其他工具中分析。</p>
      <div class="export-section">
        <button class="export-btn" id="exportJsonBtn">导出 JSON</button>
        <button class="export-btn" id="exportHtmlBtn">导出 HTML 存档</button>
        <button class="export-btn" id="exportCsvBtn" style="background:#4caf50">导出 CSV</button>
      </div>
    </div>`;
}

function bindExportButtons(tabId) {
  setTimeout(() => {
    const jsonBtn = document.getElementById('exportJsonBtn');
    const htmlBtn = document.getElementById('exportHtmlBtn');
    const csvBtn = document.getElementById('exportCsvBtn');

    if (jsonBtn) jsonBtn.addEventListener('click', () => doExportJson(tabId));
    if (htmlBtn) htmlBtn.addEventListener('click', () => doExportHtml(tabId));
    if (csvBtn) csvBtn.addEventListener('click', () => {
      if (cachedOverview) exportCSV(cachedOverview);
    });
  }, 100);
}

async function doExportJson(tabId) {
  const btn = document.getElementById('exportJsonBtn');
  btn.textContent = '导出中...';
  btn.disabled = true;
  try {
    const data = await sendToTab(tabId, { action: 'exportAllData' });
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `slowly_backup_${dateStamp()}.json`, 'application/json');
  } catch(e) {
    alert('导出失败: ' + e.message);
  }
  btn.textContent = '导出 JSON';
  btn.disabled = false;
}

async function doExportHtml(tabId) {
  const btn = document.getElementById('exportHtmlBtn');
  btn.textContent = '导出中...';
  btn.disabled = true;
  try {
    const data = await sendToTab(tabId, { action: 'exportAllData' });
    const html = buildHtmlArchive(data);
    downloadFile(html, `slowly_archive_${dateStamp()}.html`, 'text/html');
  } catch(e) {
    alert('导出失败: ' + e.message);
  }
  btn.textContent = '导出 HTML 存档';
  btn.disabled = false;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHtmlArchive(data) {
  const friendMap = {};
  (data.friends || []).forEach(f => { friendMap[f.id] = f; });

  const grouped = {};
  (data.letters || []).forEach(l => {
    const fid = l.friendId;
    if (!grouped[fid]) grouped[fid] = [];
    grouped[fid].push(l);
  });

  for (const fid of Object.keys(grouped)) {
    grouped[fid].sort((a, b) => (a.deliver_at || '').localeCompare(b.deliver_at || ''));
  }

  let sections = '';
  const sortedFids = Object.keys(grouped).sort((a, b) => {
    const na = friendMap[a]?.name || '';
    const nb = friendMap[b]?.name || '';
    return na.localeCompare(nb);
  });

  for (const fid of sortedFids) {
    const friend = friendMap[fid] || {};
    const letters = grouped[fid];
    const statusBadge = friend.status === 'hidden' ? ' <span class="badge hidden">隐藏</span>'
      : friend.status === 'removed' ? ' <span class="badge removed">已删除</span>' : '';

    let letterHtml = '';
    for (const l of letters) {
      const isMine = data.myId && l.user === data.myId;
      const sender = isMine ? '我' : (friend.name || '对方');
      const cls = isMine ? 'mine' : 'theirs';
      const stamp = l.stamp ? `<span class="stamp">🎫 ${esc(l.stamp)}</span>` : '';
      const attach = [];
      if (l.imageCount > 0) attach.push(`🖼️×${l.imageCount}`);
      if (l.audioCount > 0) attach.push(`🎵×${l.audioCount}`);
      const attachStr = attach.length > 0 ? `<span class="attach">${attach.join(' ')}</span>` : '';
      const body = esc(l.body || '').replace(/\n/g, '<br>');
      const date = l.deliver_at ? l.deliver_at.substring(0, 16).replace('T', ' ') : '';

      letterHtml += `
        <div class="letter ${cls}">
          <div class="letter-head">
            <strong>${esc(sender)}</strong>
            <span class="date">${date}</span>
            ${stamp}${attachStr}
          </div>
          <div class="letter-body">${body}</div>
        </div>`;
    }

    sections += `
      <div class="friend-section">
        <h2>${esc(friend.name || 'ID:' + fid)}${statusBadge}
          <span class="count">${letters.length} 封信</span>
        </h2>
        ${letterHtml}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Slowly 信件存档 - ${data.exportDate?.substring(0, 10) || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6fa;color:#333;padding:24px;max-width:800px;margin:0 auto}
h1{font-size:22px;color:#667eea;margin-bottom:8px}
.meta{font-size:13px;color:#999;margin-bottom:32px}
.friend-section{margin-bottom:40px}
.friend-section h2{font-size:17px;color:#555;border-bottom:2px solid #667eea;padding-bottom:8px;margin-bottom:16px}
.friend-section h2 .count{font-size:12px;color:#999;font-weight:400;margin-left:8px}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:400}
.badge.hidden{background:#fff3e0;color:#ff9800}
.badge.removed{background:#ffebee;color:#f44336}
.letter{padding:16px;margin-bottom:12px;border-radius:12px;border-left:4px solid #ddd}
.letter.mine{background:#f0f4ff;border-left-color:#667eea}
.letter.theirs{background:#fff9f0;border-left-color:#f59e0b}
.letter-head{font-size:12px;color:#888;margin-bottom:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.letter-head strong{color:#333}
.date{color:#aaa}
.stamp{background:#f3e8ff;color:#7c3aed;padding:1px 6px;border-radius:4px;font-size:11px}
.attach{font-size:11px;color:#666}
.letter-body{font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
</style>
</head>
<body>
<h1>Slowly 信件存档</h1>
<div class="meta">导出时间: ${data.exportDate || ''} · 共 ${data.friends?.length || 0} 位好友 · ${data.letters?.length || 0} 封信件</div>
${sections}
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCountryStats(adv) {
  const countries = adv.countryFromFriends || {};
  if (Object.keys(countries).length === 0) return '';

  const sorted = Object.entries(countries)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  const items = sorted.map(c => `
    <div class="country-item">
      <div class="country-flag">${countryCodeToFlag(c.code)}</div>
      <div class="country-code">${c.code.toUpperCase()}</div>
      <div class="country-count">${c.count}</div>
    </div>`).join('');

  return `
    <div class="card">
      <div class="card-title">🌍 笔友国家/地区分布</div>
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat-item">
          <div class="num">${sorted.length}</div>
          <div class="label">国家/地区</div>
        </div>
        <div class="stat-item">
          <div class="num">${sorted.reduce((a, c) => a + c.count, 0)}</div>
          <div class="label">总笔友数</div>
        </div>
      </div>
      <div class="country-grid">${items}</div>
    </div>`;
}
