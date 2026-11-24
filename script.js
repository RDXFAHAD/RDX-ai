const $ = id => document.getElementById(id);
const messages = $('messages');
const promptBox = $('prompt');
const welcome = $('welcome');
const toastEl = $('toast');
let busy = false, activeChatId = null, currentMessages = [], lastUserMessage = '';
let activeController = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  clearTimeout(window.rdxToastTimer);
  window.rdxToastTimer = setTimeout(() => toastEl.style.display = 'none', 2600);
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
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your conversations will appear here.';
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
  const item = { id: activeChatId, title: (firstUser?.text || 'New chat').slice(0, 42), messages: currentMessages, updated: Date.now() };
  localStorage.setItem('rdxChatHistory', JSON.stringify([item, ...getHistory().filter(x => x.id !== activeChatId)].slice(0, 40)));
  renderHistory();
}
function addMessage(text, role, actions = true) {
  const wrap = document.createElement('article');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  if (role === 'assistant' && actions) addMessageActions(wrap, text);
  messages.appendChild(wrap);
  $('chatScroll').scrollTop = $('chatScroll').scrollHeight;
  return wrap;
}
function addMessageActions(wrap, text) {
  const bar = document.createElement('div');
  bar.className = 'message-actions';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
    catch { toast('Copy is not available in this browser'); }
  };
  const read = document.createElement('button');
  read.textContent = 'Read aloud';
  read.onclick = () => speakText(text);
  const stop = document.createElement('button');
  stop.textContent = 'Stop voice';
  stop.onclick = stopSpeaking;
  const regen = document.createElement('button');
  regen.textContent = 'Regenerate';
  regen.onclick = regenerate;
  bar.append(copy, read, stop, regen);
  wrap.appendChild(bar);
}
function renderConversation() {
  messages.innerHTML = '';
  welcome.hidden = currentMessages.length > 0;
  currentMessages.forEach(m => addMessage(m.text, m.role, m.role === 'assistant'));
}
function setPage(page) {
  const map = { chat:['chatPage','Chat'], image:['imagePage','Image studio'], video:['videoPage','Video studio'], settings:['settingsPage','Settings'] };
  Object.entries(map).forEach(([key, [id]]) => { $(id).hidden = key !== page; });
  document.querySelectorAll('[data-page]').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  $('pageTitle').textContent = map[page][1];
  $('sidebar').classList.remove('open');
}
function newChat() {
  stopSpeaking();
  activeChatId = null; currentMessages = []; lastUserMessage = '';
  messages.innerHTML = ''; welcome.hidden = false;
  promptBox.value = ''; promptBox.style.height = '42px';
  setPage('chat'); renderHistory(); promptBox.focus();
}
function loadChat(id) {
  const item = getHistory().find(x => x.id === id);
  if (!item) return;
  activeChatId = item.id; currentMessages = item.messages || [];
  lastUserMessage = [...currentMessages].reverse().find(x => x.role === 'user')?.text || '';
  renderConversation(); setPage('chat');
}
function selectedLanguageInstruction() {
  return $('languageSelect').value === 'ur'
    ? 'Reply in simple Roman Urdu using English letters only. Do not use Urdu or Hindi script unless the user specifically asks for it.\n\n'
    : 'Reply in clear, simple English unless the user asks for another language.\n\n';
}
async function sendMessage(override) {
  const text = (override ?? promptBox.value).trim();
  if (!text || busy) return;
  stopSpeaking();
  busy = true; lastUserMessage = text;
  welcome.hidden = true;
  currentMessages.push({ role:'user', text });
  addMessage(text, 'user', false);
  promptBox.value = ''; promptBox.style.height = '42px'; saveHistory();

  const waiting = addMessage('Thinking…', 'assistant', false);
  waiting.classList.add('thinking');
  $('sendBtn').disabled = true;
  activeController = new AbortController();
  const timeoutId = setTimeout(() => activeController?.abort(), 45000);

  try {
    const response = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ message: selectedLanguageInstruction() + text }),
      signal: activeController.signal
    });
    const data = await response.json().catch(() => ({}));
    waiting.classList.remove('thinking');

    // Never render server error fields or diagnostic details in the chat.
    const reply = response.ok && typeof data.reply === 'string' && data.reply.trim()
      ? data.reply
      : 'RDX AI is temporarily unavailable. Please try again in a moment.';

    waiting.querySelector('.bubble').textContent = reply;
    addMessageActions(waiting, reply);
    currentMessages.push({ role:'assistant', text:reply }); saveHistory();
    if (response.ok && $('autoSpeak').checked) speakText(reply);
  } catch (error) {
    waiting.classList.remove('thinking');
    const message = error.name === 'AbortError'
      ? 'This is taking longer than usual. Please try again.'
      : 'RDX AI is temporarily unavailable. Please try again in a moment.';
    waiting.querySelector('.bubble').textContent = message;
    addMessageActions(waiting, message);
    currentMessages.push({ role:'assistant', text:message }); saveHistory();
  } finally {
    clearTimeout(timeoutId);
    busy = false; activeController = null;
    $('sendBtn').disabled = false;
    promptBox.focus();
  }
}
function regenerate() {
  if (!lastUserMessage || busy) return;

  // Remove the previous assistant reply and its matching user message.
  if (currentMessages.at(-1)?.role === 'assistant') currentMessages.pop();
  if (currentMessages.at(-1)?.role === 'user') currentMessages.pop();

  const lastAssistant = messages.lastElementChild;
  if (lastAssistant?.classList.contains('assistant')) {
    lastAssistant.remove();
    const lastUser = messages.lastElementChild;
    if (lastUser?.classList.contains('user')) lastUser.remove();
  }

  // sendMessage adds the user message again exactly once.
  sendMessage(lastUserMessage);
}
function speakText(text) {
  if (!('speechSynthesis' in window)) return toast('Voice playback is not supported in this browser.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = $('languageSelect').value === 'ur' ? 'ur-PK' : 'en-US';
  utterance.onstart = () => $('stopSpeakingBtn').disabled = false;
  utterance.onend = utterance.onerror = () => $('stopSpeakingBtn').disabled = true;
  speechSynthesis.speak(utterance);
}
function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('stopSpeakingBtn').disabled = true;
}
function clearHistory() {
  if (!confirm('Delete all chat history saved in this browser?')) return;
  localStorage.removeItem('rdxChatHistory');
  activeChatId = null; currentMessages = []; lastUserMessage = '';
  messages.innerHTML = ''; welcome.hidden = false; renderHistory(); toast('Chat history cleared');
}
$('newChatBtn').onclick = $('topNewChat').onclick = newChat;
document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => setPage(btn.dataset.page)));
$('mobileMenuBtn').onclick = () => $('sidebar').classList.toggle('open');
$('sendBtn').onclick = () => sendMessage();
$('stopSpeakingBtn').onclick = stopSpeaking;
promptBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
promptBox.addEventListener('input', () => { promptBox.style.height = '42px'; promptBox.style.height = Math.min(promptBox.scrollHeight, 145) + 'px'; });
document.querySelectorAll('[data-prompt]').forEach(btn => btn.onclick = () => { promptBox.value = btn.dataset.prompt; promptBox.focus(); });
$('voiceBtn').onclick = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast('Voice typing is not supported in this browser.');
  const recognition = new Recognition();
  recognition.lang = $('languageSelect').value === 'ur' ? 'ur-PK' : 'en-US';
  recognition.interimResults = false;
  recognition.onresult = e => { promptBox.value += (promptBox.value ? ' ' : '') + e.results[0][0].transcript; promptBox.focus(); };
  recognition.onerror = () => toast('Microphone permission or voice recognition failed.');
  recognition.start(); $('voiceStatus').textContent = 'Listening… speak now'; toast('Listening…');
  recognition.onend = () => $('voiceStatus').textContent = 'Enter to send · Shift + Enter for new line';
};
$('themeSelect').onchange = e => { document.body.classList.toggle('light', e.target.value === 'light'); localStorage.setItem('rdxTheme', e.target.value); };
$('languageSelect').onchange = e => { localStorage.setItem('rdxLanguage', e.target.value); toast(e.target.value === 'ur' ? 'Roman Urdu replies selected' : 'English replies selected'); };
$('clearHistoryBtn').onclick = $('settingsClearHistory').onclick = clearHistory;
$('generateImageBtn').onclick = () => toast($('imagePrompt').value.trim() ? 'Image generation is not connected yet.' : 'Please describe your image first.');
$('generateVideoBtn').onclick = () => toast($('videoPrompt').value.trim() ? 'Video generation is not connected yet.' : 'Please describe your video first.');
const savedTheme = localStorage.getItem('rdxTheme') || 'dark';
document.body.classList.toggle('light', savedTheme === 'light');
$('themeSelect').value = savedTheme;
$('languageSelect').value = localStorage.getItem('rdxLanguage') || 'ur';
$('autoSpeak').checked = localStorage.getItem('rdxAutoSpeak') === 'true';
$('autoSpeak').onchange = e => localStorage.setItem('rdxAutoSpeak', String(e.target.checked));
renderHistory(); setPage('chat');
