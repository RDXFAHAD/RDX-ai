const $ = id => document.getElementById(id);
const messages = $('messages');
const promptBox = $('prompt');
const welcome = $('welcome');
const toastEl = $('toast');
let busy = false;
let activeChatId = null;
let currentMessages = [];
let lastUserMessage = '';
let selectedFile = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  clearTimeout(window.rdxToastTimer);
  window.rdxToastTimer = setTimeout(() => toastEl.style.display = 'none', 2800);
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem('rdxChatHistory') || '[]'); }
  catch { return []; }
}
function renderHistory() {
  const list = $('chatHistory');
  list.innerHTML = '';
  const history = getHistory();
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Your chats will appear here.';
    list.appendChild(empty);
    return;
  }
  history.forEach(item => {
    const button = document.createElement('button');
    button.className = 'history-entry' + (item.id === activeChatId ? ' selected' : '');
    button.textContent = item.title || 'New chat';
    button.title = item.title || 'New chat';
    button.onclick = () => loadChat(item.id);
    list.appendChild(button);
  });
}
function saveHistory() {
  if (!currentMessages.length) return;
  if (!activeChatId) activeChatId = String(Date.now());
  const firstUser = currentMessages.find(m => m.role === 'user');
  const item = {
    id: activeChatId,
    title: (firstUser?.text || 'New chat').slice(0, 42),
    messages: currentMessages,
    updated: Date.now()
  };
  const next = [item, ...getHistory().filter(x => x.id !== activeChatId)].slice(0, 40);
  localStorage.setItem('rdxChatHistory', JSON.stringify(next));
  renderHistory();
}
function addMessage(text, role, withActions = true) {
  const bubble = document.createElement('div');
  bubble.className = 'message ' + role;
  const body = document.createElement('div');
  body.textContent = text;
  bubble.appendChild(body);
  if (role === 'assistant' && withActions) addMessageActions(bubble, text);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}
function addMessageActions(bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied!'); }
    catch { toast('Copy is not available in this browser.'); }
  };
  const read = document.createElement('button');
  read.textContent = 'Read aloud';
  read.onclick = () => speakText(text);
  const regen = document.createElement('button');
  regen.textContent = 'Regenerate';
  regen.onclick = regenerate;
  actions.append(copy, read, regen);
  bubble.appendChild(actions);
}
function renderConversation() {
  messages.innerHTML = '';
  welcome.hidden = currentMessages.length > 0;
  currentMessages.forEach(m => addMessage(m.text, m.role, m.role === 'assistant'));
}
function setPage(page) {
  const pageMap = {
    chat: ['chatPage', 'Assistant'],
    image: ['imagePage', 'Image Studio'],
    video: ['videoPage', 'Video Studio'],
    plans: ['plansPage', 'Premium Plans'],
    settings: ['settingsPage', 'Settings']
  };
  Object.entries(pageMap).forEach(([key, [id]]) => {
    $(id).hidden = key !== page;
  });
  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
  });
  $('pageTitle').textContent = pageMap[page][1];
}
function newChat() {
  activeChatId = null;
  currentMessages = [];
  lastUserMessage = '';
  messages.innerHTML = '';
  welcome.hidden = false;
  promptBox.value = '';
  promptBox.style.height = '43px';
  clearAttachment();
  setPage('chat');
  renderHistory();
  promptBox.focus();
}
function loadChat(id) {
  const item = getHistory().find(chat => chat.id === id);
  if (!item) return;
  activeChatId = item.id;
  currentMessages = item.messages || [];
  lastUserMessage = [...currentMessages].reverse().find(m => m.role === 'user')?.text || '';
  renderConversation();
  setPage('chat');
}
async function sendMessage(override) {
  const message = (override ?? promptBox.value).trim();
  if (!message || busy) return;
  busy = true;
  lastUserMessage = message;
  welcome.hidden = true;
  currentMessages.push({ role: 'user', text: message });
  addMessage(message, 'user', false);
  promptBox.value = '';
  promptBox.style.height = '43px';
  saveHistory();
  const waiting = addMessage('Thinking…', 'assistant', false);
  waiting.classList.add('thinking');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await response.json().catch(() => ({}));
    waiting.classList.remove('thinking');
    let reply = data.reply || data.error || 'The server returned an empty response.';
    if (!response.ok && Array.isArray(data.details) && data.details.length) {
      reply += '\\n\\nTechnical details:\\n' + data.details.join('\\n');
    }
    waiting.firstElementChild.textContent = reply;
    addMessageActions(waiting, reply);
    currentMessages.push({ role: 'assistant', text: reply });
    saveHistory();
    if (!response.ok) console.error('RDX AI server response:', data);
  } catch (error) {
    waiting.classList.remove('thinking');
    waiting.firstElementChild.textContent = 'Could not connect to RDX AI. Make sure the Flask server is running at http://127.0.0.1:5000.';
    console.error(error);
  } finally {
    busy = false;
    promptBox.focus();
  }
}
function regenerate() {
  if (!lastUserMessage || busy) return;
  if (currentMessages.at(-1)?.role === 'assistant') currentMessages.pop();
  const lastBubble = messages.lastElementChild;
  if (lastBubble?.classList.contains('assistant')) lastBubble.remove();
  sendMessage(lastUserMessage);
}
function speakText(text) {
  if (!('speechSynthesis' in window)) return toast('Read aloud is not supported in this browser.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  speechSynthesis.speak(utterance);
}
function clearAttachment() {
  selectedFile = null;
  $('fileInput').value = '';
  $('imagePreview').hidden = true;
  $('previewImg').removeAttribute('src');
  $('previewName').textContent = '';
}
$('newChatBtn').addEventListener('click', newChat);
document.querySelectorAll('[data-page]').forEach(button => {
  button.addEventListener('click', () => setPage(button.dataset.page));
});
$('sendBtn').addEventListener('click', () => sendMessage());
promptBox.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
promptBox.addEventListener('input', () => {
  promptBox.style.height = '43px';
  promptBox.style.height = Math.min(promptBox.scrollHeight, 145) + 'px';
});
document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => {
    promptBox.value = button.dataset.prompt;
    promptBox.focus();
  });
});
$('attachBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', event => {
  selectedFile = event.target.files?.[0] || null;
  if (!selectedFile) return;
  $('previewName').textContent = selectedFile.name;
  $('imagePreview').hidden = false;
  if (selectedFile.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => $('previewImg').src = e.target.result;
    reader.readAsDataURL(selectedFile);
  } else {
    $('previewImg').removeAttribute('src');
  }
  toast('Attachment preview ready. File upload to AI is not connected yet.');
});
$('removeImageBtn').addEventListener('click', clearAttachment);
$('voiceBtn').addEventListener('click', () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast('Voice typing is not supported in this browser.');
  const recognition = new Recognition();
  recognition.lang = $('languageSelect')?.value === 'ur' ? 'ur-PK' : 'en-US';
  recognition.interimResults = false;
  recognition.onresult = event => {
    promptBox.value += (promptBox.value ? ' ' : '') + event.results[0][0].transcript;
    promptBox.focus();
  };
  recognition.onerror = () => toast('Microphone permission or voice recognition failed.');
  recognition.start();
  toast('Listening… speak now.');
});
$('generateImageBtn').addEventListener('click', () => {
  if (!$('imagePrompt').value.trim()) return toast('Please describe the image first.');
  toast('Image generation API is not connected yet.');
});
$('generateVideoBtn').addEventListener('click', () => {
  if (!$('videoPrompt').value.trim()) return toast('Please describe the video first.');
  toast('Video generation API is not connected yet.');
});
$('themeSelect').addEventListener('change', event => {
  document.body.classList.toggle('light', event.target.value === 'light');
  localStorage.setItem('rdxTheme', event.target.value);
});
$('languageSelect').addEventListener('change', event => {
  localStorage.setItem('rdxLanguage', event.target.value);
  toast(event.target.value === 'ur' ? 'Roman Urdu selected for voice typing.' : 'English selected.');
});
const savedTheme = localStorage.getItem('rdxTheme') || 'dark';
document.body.classList.toggle('light', savedTheme === 'light');
$('themeSelect').value = savedTheme;
$('languageSelect').value = localStorage.getItem('rdxLanguage') || 'en';
renderHistory();
setPage('chat');
