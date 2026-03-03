/**
 * IndexedDB 存储模块
 * 存储好友信息和信件数据，供统计使用
 */
const SlowlyDB = (() => {
  const DB_NAME = 'SlowlyEnhanceDB';
  const DB_VERSION = 5;
  let dbInstance = null;

  function open() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('friends')) {
          const friendStore = db.createObjectStore('friends', { keyPath: 'id' });
          friendStore.createIndex('name', 'name', { unique: false });
          friendStore.createIndex('status', 'status', { unique: false });
        } else {
          const tx = e.target.transaction;
          const store = tx.objectStore('friends');
          if (!store.indexNames.contains('status')) {
            store.createIndex('status', 'status', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains('letters')) {
          const letterStore = db.createObjectStore('letters', { keyPath: 'id' });
          letterStore.createIndex('friendId', 'friendId', { unique: false });
          letterStore.createIndex('createdAt', 'created_at', { unique: false });
          letterStore.createIndex('deliverAt', 'deliver_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('stampMeta')) {
          db.createObjectStore('stampMeta', { keyPath: 'slug' });
        }
        if (!db.objectStoreNames.contains('mediaCache')) {
          const mediaStore = db.createObjectStore('mediaCache', { keyPath: 'filename' });
          mediaStore.createIndex('type', 'type', { unique: false });
          mediaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        } else {
          const tx = e.target.transaction;
          const mediaStore = tx.objectStore('mediaCache');
          if (!mediaStore.indexNames.contains('type')) {
            mediaStore.createIndex('type', 'type', { unique: false });
          }
          if (!mediaStore.indexNames.contains('updatedAt')) {
            mediaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return open().then(db => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      return { transaction, store };
    });
  }

  function put(storeName, data) {
    return tx(storeName, 'readwrite').then(({ store }) => {
      return new Promise((resolve, reject) => {
        const req = store.put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function putBatch(storeName, items) {
    return open().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        items.forEach(item => store.put(item));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    });
  }

  function get(storeName, key) {
    return tx(storeName).then(({ store }) => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function getAll(storeName) {
    return tx(storeName).then(({ store }) => {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function getAllByIndex(storeName, indexName, value) {
    return tx(storeName).then(({ store }) => {
      return new Promise((resolve, reject) => {
        const index = store.index(indexName);
        const req = index.getAll(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function count(storeName) {
    return tx(storeName).then(({ store }) => {
      return new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function clearStore(storeName) {
    return tx(storeName, 'readwrite').then(({ store }) => {
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|avif)$/i;
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|wav|opus|flac|amr|3gp|weba|caf|aif|aiff)$/i;

  function parseAttachmentString(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      if (!raw.trim()) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch(e) {
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (typeof raw === 'object') {
      if (Array.isArray(raw.files)) return raw.files;
      if (Array.isArray(raw.attachments)) return raw.attachments;
      if (Array.isArray(raw.items)) return raw.items;
      return [raw];
    }
    return [];
  }

  function isAudioLike(name = '', mime = '', type = '') {
    const lowName = String(name).toLowerCase();
    const lowMime = String(mime).toLowerCase();
    const lowType = String(type).toLowerCase();
    if (AUDIO_EXT.test(lowName)) return true;
    if (lowMime.startsWith('audio/')) return true;
    if (/(voice|audio|record|recording|sound|m4a|aac|amr|opus|wav|mp3|weba|ogg)/i.test(lowType)) return true;
    if (/(\/audio\/|voice|record|recording|amr|opus|m4a|weba|\.mp3(\?|$)|\.wav(\?|$)|\.ogg(\?|$))/i.test(lowName)) return true;
    return false;
  }

  function isImageLike(name = '', mime = '', type = '') {
    const lowName = String(name).toLowerCase();
    const lowMime = String(mime).toLowerCase();
    const lowType = String(type).toLowerCase();
    if (IMAGE_EXT.test(lowName)) return true;
    if (lowMime.startsWith('image/')) return true;
    if (/(image|photo|picture|thumbnail|thumb)/i.test(lowType)) return true;
    return false;
  }

  function pickAttachmentMeta(f) {
    if (typeof f === 'string') {
      return { name: f, mime: '', type: '' };
    }
    if (!f || typeof f !== 'object') {
      return { name: '', mime: '', type: '' };
    }
    const name = f.name || f.url || f.file || f.path || f.src || f.filename || f.key || '';
    const mime = f.mime || f.mimeType || f.content_type || f.contentType || f.media_type || '';
    const type = f.type || f.file_type || f.kind || f.category || '';
    return { name, mime, type };
  }

  function uniqStrings(arr) {
    return Array.from(new Set((arr || []).map(s => String(s || '').trim()).filter(Boolean)));
  }

  function extractBodyAudioTokens(text) {
    if (!text || typeof text !== 'string') return [];
    const tokens = [];
    const patterns = [
      /https?:\/\/[^\s"'<>]+?\.(mp3|m4a|aac|ogg|wav|opus|flac|amr|3gp|weba|caf|aif|aiff)(\?[^\s"'<>]*)?/ig,
      /\/audio\/[^\s"'<>]+/ig,
      /[A-Za-z0-9_\-/]+?\.(mp3|m4a|aac|ogg|wav|opus|flac|amr|3gp|weba|caf|aif|aiff)(\?[^\s"'<>]*)?/ig
    ];
    patterns.forEach(re => {
      const m = text.match(re);
      if (m) tokens.push(...m);
    });
    return uniqStrings(tokens);
  }

  function normalizeMediaFilename(input) {
    const raw = String(input || '').trim();
    if (!raw || raw.startsWith('type:')) return '';
    let value = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        value = u.pathname.split('/').pop() || '';
      }
    } catch (e) {}
    value = value.split('?')[0].split('#')[0];
    try {
      value = decodeURIComponent(value);
    } catch (e) {}
    return value.trim();
  }

  function classifyAttachments(raw) {
    const files = parseAttachmentString(raw);
    const images = [];
    const audio = [];
    const other = [];
    for (const f of files) {
      const { name, mime, type } = pickAttachmentMeta(f);
      if (isAudioLike(name, mime, type)) {
        audio.push(name);
      } else if (isImageLike(name, mime, type)) {
        images.push(name);
      } else if (name.length > 0) {
        // 历史兼容：未知类型但有附件名时，仍按图片计数，避免旧统计回退
        images.push(name);
      } else {
        other.push(name);
      }
    }
    return { images, audio, other, all: files };
  }

  function scanMediaFieldsFromLetter(letter) {
    const candidates = [];
    const seenObj = new WeakSet();

    function shouldScanKey(k = '') {
      return /(attach|audio|voice|sound|media|file|url|path|resource|mime|content)/i.test(k);
    }

    function walk(node, parentKey = '') {
      if (node == null) return;
      const t = typeof node;
      if (t === 'string' || t === 'number' || t === 'boolean') {
        if (parentKey && shouldScanKey(parentKey)) candidates.push(String(node));
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(item => walk(item, parentKey));
        return;
      }
      if (t === 'object') {
        if (seenObj.has(node)) return;
        seenObj.add(node);
        Object.entries(node).forEach(([k, v]) => {
          if (shouldScanKey(k)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              candidates.push(String(v));
            } else {
              walk(v, k);
            }
          } else if (typeof v === 'object' && v !== null) {
            // 继续往下找，避免遗漏嵌套字段
            walk(v, k);
          }
        });
      }
    }

    walk(letter || {});

    // 聚合常见候选字段（即使 key 不命中也尝试）
    const directFields = [
      letter?.attachments, letter?.attachment, letter?.files, letter?.file,
      letter?.audio, letter?.voice, letter?.media, letter?.resources,
      letter?.extra, letter?.style
    ];
    directFields.forEach(v => {
      const arr = parseAttachmentString(v);
      arr.forEach(item => {
        if (typeof item === 'string') candidates.push(item);
        else if (item && typeof item === 'object') {
          const meta = pickAttachmentMeta(item);
          if (meta.name) candidates.push(meta.name);
          if (meta.mime) candidates.push(meta.mime);
          if (meta.type) candidates.push(meta.type);
        }
      });
    });

    const dedup = Array.from(new Set(candidates.map(s => String(s).trim()).filter(Boolean)));
    const images = [];
    const audio = [];
    const other = [];
    dedup.forEach(text => {
      if (isAudioLike(text, text, text)) audio.push(text);
      else if (isImageLike(text, text, text)) images.push(text);
      else other.push(text);
    });
    return { images, audio, other, all: dedup };
  }

  return {
    open,
    put,
    putBatch,
    get,
    getAll,
    getAllByIndex,
    count,
    clearStore,

    saveFriends(friends, status = 'normal') {
      const items = friends.map(f => {
        const user = f.user || f;
        return {
          id: f.id || user.id,
          name: f.name || user.name,
          avatar: f.avatar || user.avatar,
          location: f.location || user.location,
          country_code: f.country_code || user.country_code,
          created_at: f.created_at,
          updated_at: f.updated_at || new Date().toISOString(),
          status: status,
          raw: f
        };
      });
      return putBatch('friends', items);
    },

    saveLetters(friendId, letters) {
      const items = letters.filter(l => l && l.id).map(l => {
        // attachments 实际格式: 逗号分隔的文件名字符串
        // 例: "49643353-5451959-1772038003_VabaRT5RGz_n.jpg,49643353-5451959-xxx.m4a"
        const fromAttachments = classifyAttachments(l.attachments);
        const fromRaw = scanMediaFieldsFromLetter(l);
        const bodyAudio = extractBodyAudioTokens(l.body || '');
        const imageFiles = uniqStrings([...(fromAttachments.images || []), ...(fromRaw.images || [])]);
        const audioFiles = uniqStrings([...(fromAttachments.audio || []), ...(fromRaw.audio || []), ...bodyAudio]);
        const typeNum = Number(l.type);
        const bodyEmpty = !(l.body || '').trim();
        const attachEmpty = !String(l.attachments || '').trim();
        // Slowly web 观测：type=5 对应语音消息（同一好友样本与实际语音数量对齐）
        if (typeNum === 5 && audioFiles.length === 0) {
          audioFiles.push(`type:5:${l.id || ''}`);
        }
        if (
          audioFiles.length === 0
          && (typeNum === 3 || typeNum === 4 || typeNum === 5)
          && (bodyEmpty || attachEmpty)
        ) {
          audioFiles.push(`type:${typeNum}`);
        }

        return {
          id: l.id,
          friendId: friendId,
          user: l.user,
          userTo: l.user_to,
          body: l.body || '',
          imageFiles,
          audioFiles,
          imageCount: imageFiles.length,
          audioCount: audioFiles.length,
          stamp: l.stamp || null,
          created_at: l.created_at,
          deliver_at: l.deliver_at,
          read_at: l.read_at,
          type: l.type,
          raw: l
        };
      });
      const pageImageCount = items.reduce((s, it) => s + (it.imageCount || 0), 0);
      const pageAudioCount = items.reduce((s, it) => s + (it.audioCount || 0), 0);
      return putBatch('letters', items).then(() => ({
        savedCount: items.length,
        imageCount: pageImageCount,
        audioCount: pageAudioCount
      }));
    },

    getLettersByFriend(friendId) {
      return getAllByIndex('letters', 'friendId', friendId);
    },

    getAllFriends() {
      return getAll('friends');
    },

    getFriendsByStatus(status) {
      return getAllByIndex('friends', 'status', status).catch(() => {
        // fallback if index doesn't exist yet
        return getAll('friends').then(all => all.filter(f => f.status === status));
      });
    },

    getAllLetters() {
      return getAll('letters');
    },

    getLetterCount() {
      return count('letters');
    },

    saveMeta(key, value) {
      return put('meta', { key, value, updatedAt: new Date().toISOString() });
    },

    getMeta(key) {
      return get('meta', key);
    },

    saveStampMeta(items) {
      const data = items.filter(i => i.slug).map(i => ({
        slug: i.slug,
        name: i.name || i.slug,
        desc: i.desc || '',
        country: i.country || '',
        type: i.type || '',
        group: i.item_group || ''
      }));
      return putBatch('stampMeta', data);
    },

    getStampMeta(slug) {
      return get('stampMeta', slug).catch(() => null);
    },

    getAllStampMeta() {
      return getAll('stampMeta').catch(() => []);
    },

    saveLoadedMedia(url, type = 'unknown', friendId = null) {
      const filename = normalizeMediaFilename(url);
      if (!filename) return Promise.resolve(null);
      return get('mediaCache', filename).catch(() => null).then(existing => {
        const friendIds = Array.isArray(existing?.friendIds) ? [...existing.friendIds] : [];
        if (friendId != null && friendId !== '') {
          const fid = String(friendId);
          if (!friendIds.includes(fid)) friendIds.push(fid);
        }
        const next = {
          filename,
          type: type || existing?.type || 'unknown',
          url: url || existing?.url || '',
          seenCount: (existing?.seenCount || 0) + 1,
          friendIds,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return put('mediaCache', next).then(() => next);
      });
    },

    getLoadedMediaByFilenames(filenames) {
      const list = uniqStrings((filenames || []).map(normalizeMediaFilename)).filter(Boolean);
      if (list.length === 0) return Promise.resolve([]);
      return Promise.all(list.map(name => get('mediaCache', name).catch(() => null)))
        .then(rows => rows.filter(Boolean));
    },

    getLoadedMediaByFriend(friendId, type = '') {
      const fid = String(friendId || '');
      if (!fid) return Promise.resolve([]);
      return getAll('mediaCache').then(items => {
        return (items || []).filter(it => {
          const matchFriend = Array.isArray(it.friendIds) && it.friendIds.includes(fid);
          if (!matchFriend) return false;
          if (!type) return true;
          return it.type === type;
        });
      }).catch(() => []);
    }
  };
})();
