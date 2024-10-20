
let popupWindowId = null;

chrome.action.onClicked.addListener((tab) => {
  if (popupWindowId === null) {
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 300,
      height: 450,
      focused: true
    }, (window) => {
      popupWindowId = window.id;
    });
  } else {
    chrome.windows.update(popupWindowId, { focused: true });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createTask') {
    fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body)
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => sendResponse({success: true, data: data}))
    .catch(error => sendResponse({success: false, error: error.message}));
    return true;  // 保持消息通道打开
  } else if (request.action === 'getTask') {
    fetch(request.url, {
      headers: request.headers
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => sendResponse({success: true, data: data}))
    .catch(error => sendResponse({success: false, error: error.message}));
    return true;  // 保持消息通道打开
  }
});
