/**
 * Content Script 主入口
 * 在 web.slowly.app 页面中运行
 */

SlowlyInterceptor.init();
SlowlyPageHelper.init();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getStats') {
    computeStats(msg.friendId).then(stats => sendResponse(stats));
    return true;
  }
  if (msg.action === 'getAllFriends') {
    SlowlyDB.getAllFriends().then(friends => sendResponse(friends));
    return true;
  }
  if (msg.action === 'getLettersByFriend') {
    SlowlyDB.getLettersByFriend(msg.friendId).then(letters => sendResponse(letters));
    return true;
  }
  if (msg.action === 'getOverview') {
    computeOverview().then(overview => sendResponse(overview));
    return true;
  }
  if (msg.action === 'getCollectionStatus') {
    Promise.all([
      SlowlyDB.getAllFriends(),
      SlowlyDB.getLetterCount()
    ]).then(([friends, letterCount]) => {
      sendResponse({
        friendCount: friends.length,
        letterCount,
        collected: SlowlyInterceptor.getCollectedCount()
      });
    });
    return true;
  }
  if (msg.action === 'getAdvancedStats') {
    computeAdvancedStats(msg.friendId).then(stats => sendResponse(stats));
    return true;
  }
  if (msg.action === 'exportAllData') {
    exportAllData().then(data => sendResponse(data));
    return true;
  }
  if (msg.action === 'clearData') {
    Promise.all([
      SlowlyDB.clearStore('friends'),
      SlowlyDB.clearStore('letters'),
      SlowlyDB.clearStore('meta')
    ]).then(() => sendResponse({ success: true }));
    return true;
  }
});

function countLetterAttachments(letter) {
  return {
    images: letter.imageCount || 0,
    audio: letter.audioCount || 0
  };
}

async function resolveMyId(letters) {
  const meta = await SlowlyDB.getMeta('currentUser');
  let myId = meta?.value?.id;

  if (!myId && letters.length > 0) {
    const userIds = [...new Set(letters.map(l => l.user))];
    if (userIds.length === 2) {
      const userToCount = {};
      letters.forEach(l => {
        if (l.userTo) userToCount[l.userTo] = (userToCount[l.userTo] || 0) + 1;
      });
      const sorted = Object.entries(userToCount).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        myId = parseInt(sorted[0][0]) || sorted[0][0];
      }
    }
  }

  return myId;
}

async function computeStats(friendId) {
  const letters = await SlowlyDB.getLettersByFriend(friendId);
  if (!letters.length) return null;

  const myId = await resolveMyId(letters);

  const sent = myId ? letters.filter(l => l.user === myId) : [];
  const received = myId ? letters.filter(l => l.user !== myId) : letters;

  function countWords(text) {
    if (!text) return { cn: 0, en: 0, total: 0 };
    const cnChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const enWords = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
      .split(/\s+/).filter(w => w.length > 0).length;
    return { cn: cnChars, en: enWords, total: cnChars + enWords };
  }

  function sumAttachments(letterList) {
    let images = 0, audio = 0;
    letterList.forEach(l => {
      const a = countLetterAttachments(l);
      images += a.images;
      audio += a.audio;
    });
    return { images, audio };
  }

  function calcAvgReplyTime(sentList, receivedList) {
    const all = [...sentList, ...receivedList].sort(
      (a, b) => new Date(a.deliver_at) - new Date(b.deliver_at)
    );
    let sentDelays = [], receivedDelays = [];
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const curr = all[i];
      const diffHours = (new Date(curr.deliver_at) - new Date(prev.deliver_at)) / (1000 * 60 * 60);
      if (curr.user === myId && prev.user !== myId) {
        sentDelays.push(diffHours);
      } else if (curr.user !== myId && prev.user === myId) {
        receivedDelays.push(diffHours);
      }
    }
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      myAvgHours: Math.round(avg(sentDelays) * 10) / 10,
      friendAvgHours: Math.round(avg(receivedDelays) * 10) / 10
    };
  }

  const sentWords = sent.reduce((acc, l) => {
    const w = countWords(l.body);
    return { cn: acc.cn + w.cn, en: acc.en + w.en, total: acc.total + w.total };
  }, { cn: 0, en: 0, total: 0 });

  const receivedWords = received.reduce((acc, l) => {
    const w = countWords(l.body);
    return { cn: acc.cn + w.cn, en: acc.en + w.en, total: acc.total + w.total };
  }, { cn: 0, en: 0, total: 0 });

  const sentAttach = sumAttachments(sent);
  const receivedAttach = sumAttachments(received);
  const replyTime = calcAvgReplyTime(sent, received);

  const dates = letters.map(l => l.deliver_at).filter(Boolean).sort();

  return {
    totalLetters: letters.length,
    sentCount: sent.length,
    receivedCount: received.length,
    sentWords,
    receivedWords,
    totalWords: {
      cn: sentWords.cn + receivedWords.cn,
      en: sentWords.en + receivedWords.en,
      total: sentWords.total + receivedWords.total
    },
    sentAttachments: sentAttach,
    receivedAttachments: receivedAttach,
    totalImages: sentAttach.images + receivedAttach.images,
    totalAudio: sentAttach.audio + receivedAttach.audio,
    replyTime,
    firstLetterDate: dates[0] || null,
    lastLetterDate: dates[dates.length - 1] || null,
    communicationDays: dates.length >= 2
      ? Math.ceil((new Date(dates[dates.length - 1]) - new Date(dates[0])) / (1000 * 60 * 60 * 24))
      : 0
  };
}

async function computeAdvancedStats(friendId) {
  const allLetters = friendId
    ? await SlowlyDB.getLettersByFriend(friendId)
    : await SlowlyDB.getAllLetters();
  const allFriends = await SlowlyDB.getAllFriends();
  const myId = await resolveMyId(allLetters);

  // 1. 邮票统计
  const stampCount = {};
  allLetters.forEach(l => {
    if (l.stamp) {
      stampCount[l.stamp] = (stampCount[l.stamp] || 0) + 1;
    }
  });
  const stampRanking = Object.entries(stampCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 2. 热力图数据（按日期统计收发数量）
  const heatmap = {};
  allLetters.forEach(l => {
    if (!l.deliver_at) return;
    const dateStr = l.deliver_at.substring(0, 10);
    if (!heatmap[dateStr]) heatmap[dateStr] = { sent: 0, received: 0, total: 0 };
    if (myId && l.user === myId) {
      heatmap[dateStr].sent++;
    } else {
      heatmap[dateStr].received++;
    }
    heatmap[dateStr].total++;
  });

  // 3. 信件长度趋势（按时间排序的每封信字数）
  const wordTrend = allLetters
    .filter(l => l.deliver_at && l.body)
    .sort((a, b) => a.deliver_at.localeCompare(b.deliver_at))
    .map(l => {
      const text = l.body || '';
      const cn = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
      const en = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
        .split(/\s+/).filter(w => w.length > 0).length;
      return {
        date: l.deliver_at.substring(0, 10),
        words: cn + en,
        isMine: myId ? l.user === myId : false,
        friendId: l.friendId
      };
    });

  // 4. 国家/地区统计
  const countryFromFriends = {};
  allFriends.forEach(f => {
    const code = f.country_code || f.raw?.location_code;
    if (code) {
      countryFromFriends[code] = (countryFromFriends[code] || 0) + 1;
    }
  });

  const countryFromLetters = {};
  allLetters.forEach(l => {
    const code = l.raw?.sent_from;
    if (code && myId && l.user !== myId) {
      countryFromLetters[code] = (countryFromLetters[code] || 0) + 1;
    }
  });

  // 5. 回信速度趋势（按月统计平均回信时间）
  const sorted = allLetters
    .filter(l => l.deliver_at)
    .sort((a, b) => a.deliver_at.localeCompare(b.deliver_at));
  const replyTrend = {};
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev.friendId || prev.friendId !== curr.friendId) continue;
    if (prev.user === curr.user) continue;
    const diffHours = (new Date(curr.deliver_at) - new Date(prev.deliver_at)) / (1000 * 60 * 60);
    if (diffHours <= 0 || diffHours > 720) continue;
    const month = curr.deliver_at.substring(0, 7);
    if (!replyTrend[month]) replyTrend[month] = { myTotal: 0, myCount: 0, friendTotal: 0, friendCount: 0 };
    if (myId && curr.user === myId) {
      replyTrend[month].myTotal += diffHours;
      replyTrend[month].myCount++;
    } else {
      replyTrend[month].friendTotal += diffHours;
      replyTrend[month].friendCount++;
    }
  }

  // 6. 活跃时段分析（按小时统计写信数量）
  const hourStats = { my: new Array(24).fill(0), friend: new Array(24).fill(0) };
  allLetters.forEach(l => {
    if (!l.created_at) return;
    const hour = parseInt(l.created_at.substring(11, 13));
    if (isNaN(hour)) return;
    if (myId && l.user === myId) {
      hourStats.my[hour]++;
    } else {
      hourStats.friend[hour]++;
    }
  });

  return {
    stampRanking,
    stampTotal: allLetters.filter(l => l.stamp).length,
    stampUnique: stampRanking.length,
    heatmap,
    wordTrend,
    countryFromFriends,
    countryFromLetters,
    replyTrend,
    hourStats
  };
}

async function computeOverview() {
  const allFriends = await SlowlyDB.getAllFriends();
  const allLetters = await SlowlyDB.getAllLetters();
  const myId = await resolveMyId(allLetters);

  if (myId) {
    const existingMeta = await SlowlyDB.getMeta('currentUser');
    if (!existingMeta?.value?.id) {
      await SlowlyDB.saveMeta('currentUser', { id: myId });
    }
  }

  const normalFriends = allFriends.filter(f => f.status === 'normal' || !f.status);
  const hiddenFriends = allFriends.filter(f => f.status === 'hidden');
  const removedFriends = allFriends.filter(f => f.status === 'removed');

  const friendLetterMap = {};
  allLetters.forEach(l => {
    if (!friendLetterMap[l.friendId]) friendLetterMap[l.friendId] = [];
    friendLetterMap[l.friendId].push(l);
  });

  let totalSent = 0, totalReceived = 0, totalWords = 0;
  let totalImages = 0, totalAudio = 0;

  function buildFriendStats(friendList) {
    const stats = [];
    for (const friend of friendList) {
      const letters = friendLetterMap[friend.id] || [];
      const sent = myId ? letters.filter(l => l.user === myId) : [];
      const received = myId ? letters.filter(l => l.user !== myId) : letters;

      let wordCount = 0;
      let imageCount = 0;
      let audioCount = 0;
      letters.forEach(l => {
        const text = l.body || '';
        const cn = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
        const en = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
          .split(/\s+/).filter(w => w.length > 0).length;
        wordCount += cn + en;
        const a = countLetterAttachments(l);
        imageCount += a.images;
        audioCount += a.audio;
      });

      totalSent += sent.length;
      totalReceived += received.length;
      totalWords += wordCount;
      totalImages += imageCount;
      totalAudio += audioCount;

      stats.push({
        id: friend.id,
        name: friend.name,
        avatar: friend.avatar,
        status: friend.status || 'normal',
        letterCount: letters.length,
        sentCount: sent.length,
        receivedCount: received.length,
        wordCount,
        imageCount,
        audioCount
      });
    }
    return stats;
  }

  const normalStats = buildFriendStats(normalFriends);
  const hiddenStats = buildFriendStats(hiddenFriends);
  const removedStats = buildFriendStats(removedFriends);

  const allStats = [...normalStats, ...hiddenStats, ...removedStats];
  allStats.sort((a, b) => b.letterCount - a.letterCount);

  return {
    totalFriends: normalFriends.length,
    hiddenFriends: hiddenFriends.length,
    removedFriends: removedFriends.length,
    friendsWithLetters: allStats.filter(f => f.letterCount > 0).length,
    totalLetters: allLetters.length,
    totalSent,
    totalReceived,
    totalWords,
    totalImages,
    totalAudio,
    friendRanking: allStats.filter(f => f.letterCount > 0),
    hiddenList: hiddenStats,
    removedList: removedStats
  };
}

async function exportAllData() {
  const allFriends = await SlowlyDB.getAllFriends();
  const allLetters = await SlowlyDB.getAllLetters();
  const myId = await resolveMyId(allLetters);

  const friendMap = {};
  allFriends.forEach(f => { friendMap[f.id] = f; });

  const lettersByFriend = {};
  allLetters.forEach(l => {
    if (!lettersByFriend[l.friendId]) lettersByFriend[l.friendId] = [];
    lettersByFriend[l.friendId].push(l);
  });

  for (const fid of Object.keys(lettersByFriend)) {
    lettersByFriend[fid].sort((a, b) => (a.deliver_at || '').localeCompare(b.deliver_at || ''));
  }

  return {
    exportDate: new Date().toISOString(),
    myId,
    friends: allFriends.map(f => ({
      id: f.id,
      name: f.name,
      status: f.status || 'normal',
      country_code: f.country_code,
      location: f.location,
      created_at: f.created_at
    })),
    letters: allLetters.map(l => ({
      id: l.id,
      friendId: l.friendId,
      friendName: friendMap[l.friendId]?.name || '',
      user: l.user,
      userTo: l.userTo,
      body: l.body,
      stamp: l.stamp,
      imageCount: l.imageCount || 0,
      audioCount: l.audioCount || 0,
      created_at: l.created_at,
      deliver_at: l.deliver_at,
      type: l.type
    })),
    lettersByFriend
  };
}
