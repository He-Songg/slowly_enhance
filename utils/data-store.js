/**
 * IndexedDB 存储模块
 * 存储好友信息和信件数据，供统计使用
 */
const SlowlyDB = (() => {
  const DB_NAME = 'SlowlyEnhanceDB';
  const DB_VERSION = 2;
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

  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)$/i;
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|wav|opus|flac|amr|3gp)$/i;

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
    return [];
  }

  function classifyAttachments(raw) {
    const files = parseAttachmentString(raw);
    const images = [];
    const audio = [];
    const other = [];
    for (const f of files) {
      const name = typeof f === 'string' ? f : (f?.name || f?.url || f?.file || '');
      if (AUDIO_EXT.test(name)) {
        audio.push(name);
      } else if (IMAGE_EXT.test(name) || name.length > 0) {
        // 默认当作图片（Slowly 附件主要是图片）
        images.push(name);
      } else {
        other.push(name);
      }
    }
    return { images, audio, other, all: files };
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
        const classified = classifyAttachments(l.attachments);

        return {
          id: l.id,
          friendId: friendId,
          user: l.user,
          userTo: l.user_to,
          body: l.body || '',
          imageFiles: classified.images,
          audioFiles: classified.audio,
          imageCount: classified.images.length,
          audioCount: classified.audio.length,
          stamp: l.stamp || null,
          created_at: l.created_at,
          deliver_at: l.deliver_at,
          read_at: l.read_at,
          type: l.type,
          raw: l
        };
      });
      return putBatch('letters', items);
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
    }
  };
})();
