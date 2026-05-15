/* ============================================================
   Echora V1 MVP Prototype — shared chat interactions
   ============================================================ */
window.echora = window.echora || {};

// Show toast notification
window.echora.showToast = (message, opts = {}) => {
  let toast = document.getElementById('echora-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'echora-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast is-visible';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, opts.duration || 2400);
};

// Scroll chat to bottom
window.echora.scrollToBottom = (containerId = 'chat-messages') => {
  const el = document.getElementById(containerId);
  if (el) el.scrollTop = el.scrollHeight;
};

// Simulate streaming text into an element
window.echora.streamText = async (elementId, text, speed = 30) => {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    await new Promise(r => setTimeout(r, speed));
  }
};

// Toggle send button to stop button
window.echora.setGenerating = (generating) => {
  const btn = document.getElementById('send-btn');
  if (!btn) return;
  if (generating) {
    btn.classList.add('chat-composer__send--stop');
    btn.innerHTML = '<i data-lucide="square" style="width:16px;height:16px;"></i>';
  } else {
    btn.classList.remove('chat-composer__send--stop');
    btn.innerHTML = '<i data-lucide="send" style="width:16px;height:16px;"></i>';
  }
  if (window.lucide) window.lucide.createIcons();
};

// Add a new message to the chat
window.echora.addMessage = (html, containerId = 'chat-messages-inner') => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const div = document.createElement('div');
  div.innerHTML = html;
  container.appendChild(div.firstElementChild);
  window.echora.scrollToBottom('chat-messages');
  if (window.lucide) window.lucide.createIcons();
};

// Handle Enter key in composer
window.echora.initComposer = (onSend) => {
  const input = document.getElementById('composer-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend && onSend(input.value);
    }
  });

  btn.addEventListener('click', () => {
    onSend && onSend(input.value);
  });
};
