const API_ENDPOINT = "https://api.klingai.com/v1/images/kolors-virtual-try-on";
let ACCESS_TOKEN = "";
let tokenExpirationTime = 0;
let countdownInterval;

let humanImageData = null;
let clothImageData = null;

document.addEventListener('DOMContentLoaded', function() {
  // 加载保存的 ACCESS_TOKEN、过期时间和人物图像
  chrome.storage.local.get(['accessToken', 'tokenExpiration', 'humanImage'], function(result) {
    if (result.accessToken && result.tokenExpiration) {
      ACCESS_TOKEN = result.accessToken;
      tokenExpirationTime = result.tokenExpiration;
      const now = new Date().getTime();
      if (now < tokenExpirationTime) {
        startTokenCountdown();
      } else {
        ACCESS_TOKEN = "";
        tokenExpirationTime = 0;
        chrome.storage.local.remove(['accessToken', 'tokenExpiration']);
      }
    }

    if (result.humanImage) {
      const img = document.getElementById('humanPreview');
      img.src = result.humanImage;
      img.style.display = 'block';
      document.querySelector('.human-image .plus-icon').style.display = 'none';
      humanImageData = result.humanImage.split(',')[1];
    }

    updateTryOnButtonState();
  });

  document.getElementById('humanImage').addEventListener('change', function(event) {
    previewImage(event, 'humanPreview');
  });

  const clothImageContainer = document.getElementById('clothImageContainer');
  clothImageContainer.addEventListener('paste', handlePaste);
  clothImageContainer.addEventListener('click', async function() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      await handleClipboardItems(clipboardItems);
    } catch (error) {
      console.error('访问剪贴板失败:', error);
      showResult('访问剪贴板失败，请确保已授予剪贴板访问权限。', 'error');
    }
  });

  document.getElementById('deleteHuman').addEventListener('click', function(event) {
    event.stopPropagation();
    clearImage('human');
  });

  document.getElementById('deleteCloth').addEventListener('click', function(event) {
    event.stopPropagation();
    clearImage('cloth');
  });

  document.getElementById('tryOnButton').addEventListener('click', startVirtualTryOn);

  // 添加"获取试衣机会"按钮的事件监听器
  document.getElementById('getTokenButton').addEventListener('click', showTokenInput);

  // 添加提交 TOKEN 的事件监听器
  document.getElementById('submitToken').addEventListener('click', submitToken);

  updateTryOnButtonState();

  document.getElementById('humanImageUpload').addEventListener('click', function() {
    document.getElementById('humanImage').click();
  });
});

function showTokenInput() {
  document.getElementById('tokenInputContainer').style.display = 'flex';
}

function submitToken() {
  const tokenInput = document.getElementById('tokenInput');
  const durationInput = document.getElementById('tokenDuration');
  ACCESS_TOKEN = tokenInput.value.trim();
  const duration = parseInt(durationInput.value, 10);
  
  if (ACCESS_TOKEN && !isNaN(duration) && duration > 0) {
    tokenExpirationTime = new Date().getTime() + duration * 60 * 1000;
    chrome.storage.local.set({
      accessToken: ACCESS_TOKEN,
      tokenExpiration: tokenExpirationTime
    }, function() {
      console.log('ACCESS_TOKEN 已保存');
    });
    document.getElementById('tokenInputContainer').style.display = 'none';
    updateTryOnButtonState();
    showResult('ACCESS_TOKEN 已更新', 'success');
    startTokenCountdown();
  } else {
    showResult('请输入有效的 ACCESS_TOKEN 和时间', 'error');
  }
}

function startTokenCountdown() {
  const countdownElement = document.getElementById('tokenCountdown');
  countdownElement.style.display = 'block';
  
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  countdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = tokenExpirationTime - now;
    
    if (distance < 0) {
      clearInterval(countdownInterval);
      countdownElement.textContent = '试衣结束。。。';
      ACCESS_TOKEN = '';
      tokenExpirationTime = 0;
      chrome.storage.local.remove(['accessToken', 'tokenExpiration']);
      updateTryOnButtonState();
    } else {
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      countdownElement.textContent = `自助试衣时间: ${minutes}分 ${seconds}秒`;
      updateTryOnButtonState();
    }
  }, 1000);
}

function previewImage(event, previewId) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = document.getElementById(previewId);
      img.src = e.target.result;
      img.style.display = 'block';
      
      const plusIcon = img.parentElement.querySelector('.plus-icon');
      if (plusIcon) {
        plusIcon.style.display = 'none';
      }

      if (previewId === 'humanPreview') {
        chrome.storage.local.set({humanImage: e.target.result});
        humanImageData = e.target.result.split(',')[1];
      }

      updateTryOnButtonState();
    }
    reader.readAsDataURL(file);

    checkAndStartProcessing();
  }
}

function checkAndStartProcessing() {
  const humanImageFile = document.getElementById('humanImage').files[0];
  const clothPreview = document.getElementById('clothPreview');

  if (humanImageFile && clothPreview.src) {
    startVirtualTryOn();
  }
}

async function startVirtualTryOn() {
  if (!ACCESS_TOKEN) {
    showResult("ACCESS_TOKEN 未加载，请检查 access_token.txt 文件", "error");
    return;
  }

  if (humanImageData && clothImageData) {
    showResult("正在处理图片，请稍候...", "info");

    try {
      const taskId = await createVirtualTryOnTask(humanImageData, clothImageData);
      if (taskId) {
        showResult("任务已创建，正在等待结果...", "info");
        await waitForTaskCompletion(taskId);
      }
    } catch (error) {
      showResult(`发生错误: ${error.message}`, "error");
    }
  } else {
    showResult("请确保已上传人物图像和服装图像", "warning");
  }
}

async function createVirtualTryOnTask(humanImage, clothImage) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'createTask',
      url: API_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      },
      body: {
        model_name: "kolors-virtual-try-on-v1",
        human_image: humanImage,
        cloth_image: clothImage
      }
    }, response => {
      if (response.success) {
        resolve(response.data.data.task_id);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

async function getVirtualTryOnTask(taskId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'getTask',
      url: `${API_ENDPOINT}/${taskId}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    }, response => {
      if (response.success) {
        resolve(response.data.data);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

async function waitForTaskCompletion(taskId) {
  let attempts = 0;
  const maxAttempts = 30; // 最多等待 150 秒
  
  while (attempts < maxAttempts) {
    try {
      const taskData = await getVirtualTryOnTask(taskId);
      if (taskData.task_status === 'succeed') {
        if (taskData.task_result && taskData.task_result.images && taskData.task_result.images.length > 0) {
          const imageUrl = taskData.task_result.images[0].url;
          showResult(`<img src="${imageUrl}" alt="虚拟试穿结果" class="result-image">`, "success");
          addImageClickListener(imageUrl);
          return;
        } else {
          throw new Error("未找到图像URL。");
        }
      } else if (taskData.task_status === 'failed') {
        throw new Error("试穿任务失败，请重试。");
      }
    } catch (error) {
      showResult(`获取结果时出错: ${error.message}`, "error");
      return;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    showResult(`正在等待结果，已等待 ${attempts * 5} 秒...`, "info");
  }

  showResult("等待超时，请稍后重试。", "error");
}

function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

function showResult(message, type) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `<p class="${type}">${message}</p>`;
  console.log(`Result (${type}):`, message);
  
  if (type === 'error') {
    resultDiv.innerHTML += `<p class="error">详细错误: ${message}</p>`;
    console.error('Detailed error:', message);
  }
}

function addImageClickListener(imageUrl) {
  const resultImage = document.querySelector('.result-image');
  if (resultImage) {
    resultImage.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <img src="${imageUrl}" alt="虚拟试穿结果" class="modal-image">
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
    });
  }
}

function handlePaste(e) {
  e.preventDefault();
  const items = e.clipboardData.items;
  handleClipboardItems(items);
}

async function handleClipboardItems(clipboardItems) {
  for (const item of clipboardItems) {
    if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
      try {
        const blob = await item.getType('image/png') || await item.getType('image/jpeg');
        const reader = new FileReader();
        reader.onload = function(event) {
          const img = document.getElementById('clothPreview');
          img.src = event.target.result;
          img.style.display = 'block';
          
          const pasteInstruction = document.querySelector('.paste-instruction');
          if (pasteInstruction) {
            pasteInstruction.style.display = 'none';
          }
          
          clothImageData = event.target.result.split(',')[1];
          updateTryOnButtonState();
        };
        reader.readAsDataURL(blob);
        break;
      } catch (error) {
        console.error('读取剪贴板图片失败:', error);
        showResult('读取剪贴板图片失败，请重试。', 'error');
      }
    }
  }
}

function handlePasteError(error) {
  console.error('粘贴失败:', error);
  showResult('粘贴图片失败，请重试或使用文件上传。', 'error');
}

function clearImage(type) {
  if (type === 'human') {
    document.getElementById('humanPreview').src = '';
    document.getElementById('humanPreview').style.display = 'none';
    document.querySelector('.human-image .plus-icon').style.display = 'block';
    document.getElementById('humanImage').value = '';
    chrome.storage.local.remove('humanImage');
    humanImageData = null;
  } else if (type === 'cloth') {
    document.getElementById('clothPreview').src = '';
    document.getElementById('clothPreview').style.display = 'none';
    document.querySelector('.cloth-image .paste-instruction').style.display = 'block';
    clothImageData = null;
  }
  updateTryOnButtonState();
}

function updateTryOnButtonState() {
  const tryOnButton = document.getElementById('tryOnButton');
  const now = new Date().getTime();
  tryOnButton.disabled = !(humanImageData && clothImageData && ACCESS_TOKEN && now < tokenExpirationTime);
}
