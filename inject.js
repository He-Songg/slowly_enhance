/**
 * 注入到页面主世界（MAIN world）的脚本
 * 直接 monkey-patch fetch 和 XMLHttpRequest
 * 通过 postMessage 将 API 响应传递给 content script
 */
(function() {
  if (window.__slowlyEnhanceInjected) return;
  window.__slowlyEnhanceInjected = true;

  const API_HOST = 'api.getslowly.com';
  const EVENT_SENT = '__SLOWLY_ENHANCE_DRAFT_SENT__';

  function shouldIntercept(url) {
    try {
      const u = new URL(url, location.origin);
      return u.hostname === API_HOST;
    } catch(e) { return false; }
  }

  function pickFriendIdFromReplyUrl(url) {
    try {
      const u = new URL(url, location.origin);
      const m = u.pathname.match(/\/friend\/([^/]+)\/reply\b/i);
      return m ? String(m[1]) : '';
    } catch {
      return '';
    }
  }

  function hashText(s) {
    // djb2
    const str = String(s || '');
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function tryParseJsonBody(body) {
    try {
      if (!body) return null;
      if (typeof body === 'string') return JSON.parse(body);
      return null;
    } catch {
      return null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : (request?.url || '');
    const opt = args[1] || {};
    const method = String((opt && opt.method) || (request && request.method) || 'GET').toUpperCase();

    const isReply = /\/friend\/[^/]+\/reply\b/i.test(String(url || ''));
    const friendId = isReply ? pickFriendIdFromReplyUrl(url) : '';
    const bodyObj = isReply && method === 'POST'
      ? tryParseJsonBody(opt && opt.body)
      : null;
    const bodyText = bodyObj && typeof bodyObj.body === 'string' ? bodyObj.body : '';
    const bodyHash = bodyText ? hashText(bodyText) : '';
    const clearDraftFlag = !!(bodyObj && bodyObj.cleardraft);

    if (!shouldIntercept(url)) {
      return originalFetch.apply(this, args);
    }

    return originalFetch.apply(this, args).then(response => {
      const cloned = response.clone();
      cloned.text().then(text => {
        try {
          const data = JSON.parse(text);
          window.postMessage({
            type: '__SLOWLY_ENHANCE_RESPONSE__',
            url: url,
            data: data
          }, '*');
        } catch(e) {}
      }).catch(() => {});

      // 发送信件成功后，通知草稿缓存清除（仅发送最小信息：friendId + bodyHash）
      try {
        if (isReply && friendId && method === 'POST' && response && response.ok) {
          window.postMessage({
            type: EVENT_SENT,
            url,
            friendId,
            bodyHash,
            cleardraft: clearDraftFlag,
            at: new Date().toISOString()
          }, '*');
        }
      } catch(e) {}
      return response;
    }).catch(err => {
      throw err;
    });
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__seUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this.__seUrl && shouldIntercept(this.__seUrl)) {
      const self = this;
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(self.responseText);
          window.postMessage({
            type: '__SLOWLY_ENHANCE_RESPONSE__',
            url: self.__seUrl,
            data: data
          }, '*');
        } catch(e) {}
      });
    }
    return origSend.apply(this, args);
  };

  console.log('[Slowly Enhance] 网络拦截器已注入到页面主世界');
})();
