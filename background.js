chrome.action.onClicked.addListener((tab) => {
  if (!tab.url?.includes('web.slowly.app')) {
    chrome.tabs.create({ url: 'https://web.slowly.app/' });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openStats') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('stats.html') + (msg.friendId ? `?friendId=${msg.friendId}` : '')
    });
  }
});
