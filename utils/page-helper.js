/**
 * 页面辅助功能
 * 在 Slowly Web 页面中注入浮动状态指示器和快速浏览辅助
 */
const SlowlyPageHelper = (() => {
  let indicator = null;
  let collectCount = { friends: 0, letters: 0 };
  let activeFriendId = null;

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

  // ========== 已加载附件缓存（方案二） ==========

  function getMediaTypeByUrl(url = '') {
    const low = String(url).toLowerCase();
    if (!low || low.startsWith('blob:') || low.startsWith('data:')) return '';
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|avif)(\?|$)/i.test(low) || /image/i.test(low)) return 'image';
    if (/\.(mp3|m4a|aac|ogg|wav|opus|flac|amr|3gp|weba|caf|aif|aiff)(\?|$)/i.test(low) || /(\/audio\/|voice|record)/i.test(low)) return 'audio';
    return '';
  }

  function cacheMediaUrl(url) {
    const type = getMediaTypeByUrl(url);
    if (!type || !SlowlyDB?.saveLoadedMedia) return;
    SlowlyDB.saveLoadedMedia(url, type, activeFriendId).catch(() => {});
  }

  function scanNodeForMedia(node) {
    if (!node || node.nodeType !== 1) return;
    const root = node;
    const src = root.getAttribute && root.getAttribute('src');
    if (src) cacheMediaUrl(src);
    if (root.querySelectorAll) {
      root.querySelectorAll('img[src],audio[src],source[src]').forEach(el => {
        const u = el.getAttribute('src');
        if (u) cacheMediaUrl(u);
      });
    }
  }

  function watchLoadedMedia() {
    scanNodeForMedia(document.body);

    document.addEventListener('load', (e) => {
      const el = e.target;
      if (!el || !el.tagName) return;
      if (el.tagName === 'IMG' || el.tagName === 'AUDIO' || el.tagName === 'SOURCE') {
        const u = el.getAttribute('src') || el.src;
        if (u) cacheMediaUrl(u);
      }
    }, true);

    const obs = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          const u = m.target?.getAttribute?.('src') || m.target?.src;
          if (u) cacheMediaUrl(u);
        }
        m.addedNodes?.forEach(n => scanNodeForMedia(n));
      });
    });
    obs.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  // ========== 编辑器工具栏 ==========

  let editorToolbar = null;
  let currentEditor = null;

  function createEditorToolbar() {
    if (editorToolbar) return;

    const style = document.createElement('style');
    style.textContent = `
      #se-editor-toolbar {
        position: fixed;
        top: 10px;
        right: 80px;
        z-index: 99998;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #se-editor-bar {
        display: flex;
        gap: 4px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.95);
        border-radius: 10px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.12);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(0,0,0,0.08);
      }
      .se-ed-btn {
        padding: 5px 10px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        color: #555;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .se-ed-btn:hover {
        background: #667eea;
        color: white;
        border-color: #667eea;
      }
      .se-ed-btn.primary {
        background: #667eea;
        color: white;
        border-color: #667eea;
      }
      .se-ed-btn.primary:hover {
        background: #5a6fd6;
      }
    `;
    document.head.appendChild(style);

    editorToolbar = document.createElement('div');
    editorToolbar.id = 'se-editor-toolbar';
    editorToolbar.innerHTML = `
      <div id="se-editor-bar">
        <button class="se-ed-btn" data-action="indent" title="在光标处插入8个空格缩进 (Tab)">⇥ 缩进</button>
        <button class="se-ed-btn" data-action="indentAll" title="为每个段落添加段首缩进">¶ 全文缩进</button>
        <button class="se-ed-btn" data-action="trimLines" title="将连续空行合并为一个 (Ctrl+Shift+L)">⊟ 清理空行</button>
        <button class="se-ed-btn" data-action="trimSpaces" title="去除每行首尾多余空格">⊞ 清理空格</button>
        <button class="se-ed-btn primary" data-action="formatAll" title="一键执行全文缩进+清理空行+清理空格 (Ctrl+Shift+F)">✨ 一键整理</button>
      </div>
    `;
    document.body.appendChild(editorToolbar);

    editorToolbar.querySelectorAll('.se-ed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        if (currentEditor) handleEditorAction(action, currentEditor);
      });
    });
  }

  function getEditorValue(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    return el.innerText || el.textContent || '';
  }

  function setEditorValue(el, val) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = val;
    } else {
      el.innerText = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const INDENT = '        '; // 8 half-width spaces

  function handleEditorAction(action, el) {
    const val = getEditorValue(el);
    let result = val;

    switch (action) {
      case 'indent': {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          const start = el.selectionStart;
          result = val.substring(0, start) + INDENT + val.substring(el.selectionEnd);
          setEditorValue(el, result);
          el.selectionStart = el.selectionEnd = start + INDENT.length;
          el.focus();
        } else {
          document.execCommand('insertText', false, INDENT);
        }
        return;
      }
      case 'indentAll': {
        const lines = val.split('\n');
        result = lines.map(line => {
          const trimmed = line.replace(/^\s+/, '');
          if (trimmed.length === 0) return line;
          return INDENT + trimmed;
        }).join('\n');
        break;
      }
      case 'trimLines': {
        result = val.replace(/\n{3,}/g, '\n\n');
        break;
      }
      case 'trimSpaces': {
        result = val.split('\n').map(line => line.trimEnd()).join('\n');
        break;
      }
      case 'dedent': {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          const start = el.selectionStart;
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          const linePrefix = val.substring(lineStart, start);
          const spaces = linePrefix.match(/^ {1,8}/);
          if (spaces) {
            result = val.substring(0, lineStart) + val.substring(lineStart + spaces[0].length);
            setEditorValue(el, result);
            el.selectionStart = el.selectionEnd = Math.max(lineStart, start - spaces[0].length);
            el.focus();
          }
        }
        return;
      }
      case 'formatAll': {
        let text = val;
        text = text.split('\n').map(line => line.trimEnd()).join('\n');
        text = text.replace(/\n{3,}/g, '\n\n');
        const lines = text.split('\n');
        text = lines.map(line => {
          const trimmed = line.replace(/^\s+/, '');
          if (trimmed.length === 0) return '';
          return INDENT + trimmed;
        }).join('\n');
        result = text;
        break;
      }
    }

    setEditorValue(el, result);
    el.focus();
  }

  function isEditorElement(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
    return false;
  }

  function watchForEditor() {
    createEditorToolbar();

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (isEditorElement(el)) {
        currentEditor = el;
        if (editorToolbar) editorToolbar.style.display = 'block';
      }
    });

    document.addEventListener('focusout', (e) => {
      setTimeout(() => {
        const active = document.activeElement;
        if (editorToolbar && editorToolbar.contains(active)) return;
        if (!isEditorElement(active)) {
          if (editorToolbar) editorToolbar.style.display = 'none';
          currentEditor = null;
        }
      }, 200);
    });

    document.addEventListener('keydown', (e) => {
      if (!currentEditor) return;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Tab' && !e.shiftKey && !mod) {
        e.preventDefault();
        handleEditorAction('indent', currentEditor);
        return;
      }
      if (e.key === 'Tab' && e.shiftKey && !mod) {
        e.preventDefault();
        handleEditorAction('dedent', currentEditor);
        return;
      }
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleEditorAction('formatAll', currentEditor);
        return;
      }
      if (mod && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleEditorAction('trimLines', currentEditor);
        return;
      }
    });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        createIndicator();
        watchLoadedMedia();
        watchForEditor();
      });
    } else {
      createIndicator();
      watchLoadedMedia();
      watchForEditor();
    }

    window.addEventListener('slowly-enhance-update', (e) => {
      const { total } = e.detail;
      updateStats(total.friends || 0, total.letters || 0);
      showCollecting();
      setTimeout(hideCollecting, 2000);
    });
    window.addEventListener('slowly-enhance-active-friend', (e) => {
      const fid = e?.detail?.friendId;
      if (fid != null) activeFriendId = String(fid);
    });
  }

  return { init, updateStats };
})();
