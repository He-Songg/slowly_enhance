/**
 * 网络拦截器 - Content Script 端
 *
 * 已确认的 API 数据结构：
 *   /users/me/friends/v2 => { friends:[...], hidden:[...], requests:[...] }
 *     - friends 是正常好友，hidden 是隐藏好友，requests 是好友请求
 *   /friend/{id}/all?page=1 => { post:{...}, user:{...}, comments:{ current_page, data:[...] } }
 *   /web/me => { id, name, avatar, ... }
 */
const SlowlyInterceptor = (() => {
  const API_PATTERNS = {
    friends: /\/users\/me\/friends/,
    letters: /\/friend\/(\d+)\/all/,
    incoming: /\/letter\/incoming/,
    me: /\/web\/me$/,
    meV2: /\/users\/me\/v2/
  };

  let collectedCount = { friends: 0, letters: 0, hidden: 0, removed: 0 };
  let letterFieldsLogged = false;

  function notifyCollection(type, count) {
    collectedCount[type] = (collectedCount[type] || 0) + count;
    window.dispatchEvent(new CustomEvent('slowly-enhance-update', {
      detail: { type, count, total: { ...collectedCount } }
    }));
  }

  function extractFriendIdFromUrl(url) {
    const match = url.match(/\/friend\/(\d+)\/all/);
    return match ? parseInt(match[1]) : null;
  }

  async function processResponse(url, responseData) {
    try {
      if (API_PATTERNS.letters.test(url)) {
        const friendId = extractFriendIdFromUrl(url);
        if (friendId) {
          await processLetters(friendId, responseData);
        }
      } else if (API_PATTERNS.friends.test(url)) {
        await processFriendsList(responseData);
      } else if (API_PATTERNS.me.test(url) || API_PATTERNS.meV2.test(url)) {
        await processMe(responseData);
      }
    } catch (err) {
      console.warn('[Slowly Enhance] 处理响应数据时出错:', err);
    }
  }

  async function processFriendsList(data) {
    if (!data || typeof data !== 'object') return;

    // 正常好友: data.friends
    const friends = Array.isArray(data.friends) ? data.friends : [];
    if (friends.length > 0) {
      await SlowlyDB.saveFriends(friends, 'normal');
      notifyCollection('friends', friends.length);
      console.log(`[Slowly Enhance] ✓ 已收集 ${friends.length} 个正常好友`);
    }

    // 隐藏好友: data.hidden
    const hidden = Array.isArray(data.hidden) ? data.hidden : [];
    if (hidden.length > 0) {
      await SlowlyDB.saveFriends(hidden, 'hidden');
      notifyCollection('hidden', hidden.length);
      console.log(`[Slowly Enhance] ✓ 已收集 ${hidden.length} 个隐藏好友`);
    }

    // 已删除好友: data.removed
    const removed = Array.isArray(data.removed) ? data.removed : [];
    if (removed.length > 0) {
      await SlowlyDB.saveFriends(removed, 'removed');
      notifyCollection('removed', removed.length);
      console.log(`[Slowly Enhance] ✓ 已收集 ${removed.length} 个已删除好友`);
    }

    // 好友请求: data.requests (仅记录数量)
    const requests = Array.isArray(data.requests) ? data.requests : [];
    if (requests.length > 0) {
      console.log(`[Slowly Enhance] 检测到 ${requests.length} 个好友请求`);
    }

    // 打印响应中所有顶层 key 帮助发现更多字段
    const topKeys = Object.keys(data);
    const unhandled = topKeys.filter(k => !['friends', 'hidden', 'removed', 'requests'].includes(k));
    if (unhandled.length > 0) {
      console.log('[Slowly Enhance] 好友列表响应中还有未处理的字段:', unhandled);
      unhandled.forEach(k => {
        if (Array.isArray(data[k]) && data[k].length > 0 && data[k][0].name) {
          console.log(`[Slowly Enhance] 字段 "${k}" 看起来也是好友列表，共 ${data[k].length} 项`);
        }
      });
    }
  }

  async function processLetters(friendId, data) {
    if (!data || typeof data !== 'object') return;

    let letters = null;

    if (data.comments) {
      if (Array.isArray(data.comments)) {
        letters = data.comments;
      } else if (data.comments.data && Array.isArray(data.comments.data)) {
        letters = data.comments.data;
      }
    }

    if (!letters) {
      if (Array.isArray(data.data)) {
        letters = data.data;
      } else if (data.data?.comments) {
        if (Array.isArray(data.data.comments)) {
          letters = data.data.comments;
        } else if (data.data.comments.data && Array.isArray(data.data.comments.data)) {
          letters = data.data.comments.data;
        }
      }
    }

    if (!letters && Array.isArray(data)) {
      letters = data;
    }

    if (!Array.isArray(letters) || letters.length === 0) {
      console.log('[Slowly Enhance] 该页无信件数据，friendId:', friendId);
      return;
    }

    // 打印信件字段详情（仅一次）
    if (!letterFieldsLogged && letters.length > 0) {
      console.log('[Slowly Enhance] 📋 ====== 信件字段调试信息 ======');
      const sample = letters[0];
      console.log('[Slowly Enhance] 📋 信件字段列表:', Object.keys(sample));
      // 打印每个非空字段
      for (const [key, val] of Object.entries(sample)) {
        if (key === 'body') {
          console.log(`[Slowly Enhance] 📋 "${key}" = (string, ${(val||'').length} chars)`);
        } else {
          console.log(`[Slowly Enhance] 📋 "${key}" =`, JSON.stringify(val));
        }
      }
      console.log('[Slowly Enhance] 📋 ====== 调试信息结束 ======');
      letterFieldsLogged = true;
    }

    if (data.post && data.user) {
      try {
        const post = data.post;
        const myId = post.user === data.user.id ? post.joined : post.user;
        const existingMeta = await SlowlyDB.getMeta('currentUser');
        if (!existingMeta?.value?.id && myId) {
          await SlowlyDB.saveMeta('currentUser', { id: myId });
          console.log(`[Slowly Enhance] ✓ 从信件推断当前用户 ID: ${myId}`);
        }
      } catch (e) {}
    }

    await SlowlyDB.saveLetters(friendId, letters);
    notifyCollection('letters', letters.length);

    const page = data.comments?.current_page || '?';
    console.log(`[Slowly Enhance] ✓ 已收集好友 ${friendId} 第 ${page} 页的 ${letters.length} 封信件`);
  }

  async function processMe(data) {
    const user = data?.data || data;
    if (user && user.id) {
      await SlowlyDB.saveMeta('currentUser', {
        id: user.id,
        name: user.name,
        avatar: user.avatar
      });
      console.log(`[Slowly Enhance] ✓ 已记录当前用户: ${user.name || user.id}`);
    }
  }

  function init() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== '__SLOWLY_ENHANCE_RESPONSE__') return;
      processResponse(event.data.url, event.data.data);
    });

    console.log('[Slowly Enhance] Content Script 拦截器已初始化');
  }

  return { init, getCollectedCount: () => ({ ...collectedCount }) };
})();
