/**
 * 注入到页面主世界（MAIN world）的脚本
 * 直接 monkey-patch fetch 和 XMLHttpRequest
 * 通过 postMessage 将 API 响应传递给 content script
 */
(function() {
  if (window.__slowlyEnhanceInjected) return;
  window.__slowlyEnhanceInjected = true;

  const API_HOST = 'api.getslowly.com';

  function shouldIntercept(url) {
    try {
      const u = new URL(url, location.origin);
      return u.hostname === API_HOST;
    } catch(e) { return false; }
  }

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : (request?.url || '');

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
