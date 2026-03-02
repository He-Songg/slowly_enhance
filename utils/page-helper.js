/**
 * 页面辅助功能
 * 在 Slowly Web 页面中注入浮动状态指示器和快速浏览辅助
 */
const SlowlyPageHelper = (() => {
  let indicator = null;
  let collectCount = { friends: 0, letters: 0 };

  function createIndicator() {
    if (indicator) return;

    indicator = document.createElement('div');
    indicator.id = 'slowly-enhance-indicator';
    indicator.innerHTML = `
      <div id="se-badge">
        <span id="se-icon">📊</span>
        <span id="se-text">Enhance</span>
      </div>
      <div id="se-panel" style="display:none">
        <div id="se-panel-title">Slowly Enhance</div>
        <div id="se-panel-stats">
          <div>好友: <strong id="se-friends">0</strong></div>
          <div>信件: <strong id="se-letters">0</strong></div>
        </div>
        <div id="se-panel-hint">浏览好友信件时自动收集数据</div>
        <div id="se-panel-actions">
          <button id="se-btn-scroll">快速翻页 ▼</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #slowly-enhance-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #se-badge {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 8px 14px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 2px 12px rgba(102,126,234,0.4);
        transition: transform 0.2s;
        user-select: none;
      }
      #se-badge:hover { transform: scale(1.05); }
      #se-icon { font-size: 16px; }
      #se-panel {
        position: absolute;
        bottom: 48px;
        right: 0;
        background: white;
        border-radius: 12px;
        padding: 16px;
        width: 220px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      }
      #se-panel-title {
        font-size: 14px;
        font-weight: 600;
        color: #333;
        margin-bottom: 10px;
      }
      #se-panel-stats {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: #666;
        margin-bottom: 10px;
      }
      #se-panel-stats strong { color: #667eea; }
      #se-panel-hint {
        font-size: 11px;
        color: #999;
        margin-bottom: 10px;
      }
      #se-panel-actions { display: flex; gap: 6px; }
      #se-btn-scroll {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #667eea;
        background: white;
        color: #667eea;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.15s;
      }
      #se-btn-scroll:hover {
        background: #667eea;
        color: white;
      }
      @keyframes se-pulse {
        0%, 100% { box-shadow: 0 2px 12px rgba(102,126,234,0.4); }
        50% { box-shadow: 0 2px 20px rgba(102,126,234,0.7); }
      }
      #se-badge.collecting { animation: se-pulse 1.5s ease-in-out infinite; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(indicator);

    const badge = document.getElementById('se-badge');
    const panel = document.getElementById('se-panel');

    badge.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!indicator.contains(e.target)) {
        panel.style.display = 'none';
      }
    });

    document.getElementById('se-btn-scroll').addEventListener('click', () => {
      autoScrollLetters();
    });
  }

  function updateStats(friends, letters) {
    collectCount.friends = friends;
    collectCount.letters = letters;
    const friendsEl = document.getElementById('se-friends');
    const lettersEl = document.getElementById('se-letters');
    if (friendsEl) friendsEl.textContent = friends;
    if (lettersEl) lettersEl.textContent = letters;
  }

  function showCollecting() {
    const badge = document.getElementById('se-badge');
    if (badge) badge.classList.add('collecting');
  }

  function hideCollecting() {
    const badge = document.getElementById('se-badge');
    if (badge) badge.classList.remove('collecting');
  }

  function autoScrollLetters() {
    const scrollContainer = document.querySelector('[class*="letter"] [class*="scroll"]')
      || document.querySelector('[class*="message"] [class*="scroll"]')
      || document.querySelector('main')
      || document.querySelector('[role="main"]');

    if (!scrollContainer) {
      const allScrollable = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.scrollHeight > el.clientHeight && el.clientHeight > 200;
      });
      if (allScrollable.length > 0) {
        doScroll(allScrollable[allScrollable.length - 1]);
        return;
      }
      alert('未找到可滚动区域，请手动浏览信件');
      return;
    }
    doScroll(scrollContainer);
  }

  function doScroll(el) {
    const btn = document.getElementById('se-btn-scroll');
    if (btn) btn.textContent = '滚动中...';

    let scrollCount = 0;
    const maxScrolls = 50;
    const interval = setInterval(() => {
      el.scrollTop += 500;
      scrollCount++;
      if (scrollCount >= maxScrolls || el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
        clearInterval(interval);
        if (btn) btn.textContent = '快速翻页 ▼';
      }
    }, 300);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createIndicator);
    } else {
      createIndicator();
    }

    window.addEventListener('slowly-enhance-update', (e) => {
      const { total } = e.detail;
      updateStats(total.friends || 0, total.letters || 0);
      showCollecting();
      setTimeout(hideCollecting, 2000);
    });
  }

  return { init, updateStats };
})();
